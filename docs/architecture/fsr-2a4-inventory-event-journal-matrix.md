# FSR-2A.4 Inventory Event-to-Journal Matrix

## Pattern: A (GRN and Supplier Invoice are distinct events)

| # | Event | Source Table | Posting Function | Stock Ledger Effect | GL Debit | GL Credit | Voucher Type | Approval Req |
|---|-------|-------------|-----------------|--------------------|----------|-----------|-------------|-------------|
| 1 | Goods Receipt / GRN | stock_inwards | `postStockInward()` | +quantity +value | Inventory | GRNI | Journal | Draft→Posted |
| 2 | Supplier Invoice (inventory) | vouchers | `createBalancedVoucher()` / `businessVoucherPayload()` | none | GRNI, Input GST | Trade Payables | Purchase | Approved |
| 3 | Supplier Invoice (non-inventory) | vouchers | `createBalancedVoucher()` / `businessVoucherPayload()` | none | Purchase, Input GST | Trade Payables | Purchase | Approved |
| 4 | Stock Outward / Issue | stock_outwards | `postStockOutward()` | -quantity -value | COGS | Inventory | Journal | Draft→Posted |
| 5 | Department Return | stock_returns | `postStockReturn()` | +quantity +value | Inventory | COGS | Journal | Draft→Posted |
| 6 | Supplier Return | stock_returns | `postStockReturn()` | -quantity -value | GRNI | Inventory | Journal | Draft→Posted |
| 7 | Adjustment Increase | stock_adjustments | `postStockAdjustment()` | +quantity +value | Inventory | Stock Adj Gain/Loss | Journal | **Approved** |
| 8 | Adjustment Decrease | stock_adjustments | `postStockAdjustment()` | -quantity -value | Stock Adj Gain/Loss | Inventory | Journal | **Approved** |
| 9 | Damage / Loss | stock_adjustments | `postStockAdjustment()` (Decrease) | -quantity -value | Stock Adj Gain/Loss | Inventory | Journal | **Approved** |
| 10 | Warehouse Transfer | warehouse_transfers | `postWarehouseTransfer()` | transfer qty/value | N/A (company-level zero) | N/A | N/A | Draft→Posted |
| 11 | Cross-Company Transfer | N/A | **BLOCKED** | N/A | N/A | N/A | N/A | N/A |
| 12 | Opening Inventory | carry_forward_entries | FSR-2A.5 | N/A | N/A | N/A | N/A | N/A |

## Posting State Enforcement

| State | Stock Ledger | GL Effect | Audit |
|-------|-------------|-----------|-------|
| Draft | No | No | No |
| Posted | Yes | Yes | Yes |
| Cancelled | No (or reversed) | No (or reversed) | Yes |
| Rejected | No | No | No |

## Verification Results

Each event in the matrix is verified by `scripts/verify-fsr-2a4.js`:

| Event | Verifier Checks | Status |
|-------|----------------|--------|
| GRN / Stock Inward | 1-5, 23, 32, 36 | PASS |
| Supplier Invoice (GRNI clearing) | 21-22, 24-26, 29-30 | PASS |
| Stock Outward | 6-8 | PASS |
| Department Return | 15-17 | PASS |
| Supplier Return | 18-20, 34 | PASS |
| Adjustment Increase | 9-11 | PASS |
| Adjustment Decrease | 12-14 | PASS |
| Cross-Company Isolation | 35 | PASS |
| Zero-Value Rejection | 32-33 | PASS |
| Audit Trail | 39 | PASS |
| Stock-GL Reconciliation | 5, 8, 31, 38 | PASS |
| TB Balance | 26, 37 | PASS |
