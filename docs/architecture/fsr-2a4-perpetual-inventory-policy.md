# FSR-2A.4 Perpetual Inventory Policy

## Classification
- **Primary Category:** Accounting
- **Secondary Categories:** Inventory, Audit
- **Phase:** FSR-2A.4
- **Status:** Implemented — Certification Hardening Required

## Accounting Policy

Adopt controlled PERPETUAL INVENTORY model (Pattern A — GRN and Supplier Invoice are distinct events).

### 1. Goods Receipt / Stock Inward (GRN)

```
Dr Inventory                          (landed cost value)
    Cr Goods Received Not Invoiced    (landed cost value)
```

- Landed cost = `COALESCE(landed_cost, quantity * rate)` from stock_inwards record
- Recoverable GST is NOT included (only taxable value + non-recoverable costs)
- Valuation basis: landed cost from supplier invoice/purchase order
- Source table: `stock_inwards`
- Voucher type: Journal, source_module: stock_inwards

### 2. Stock Outward / Issue / Delivery

```
Dr Cost of Goods Sold                 (issue quantity × WAC)
    Cr Inventory                      (issue quantity × WAC)
```

- Weighted Average Cost recalculated on each inward/outward/return/adjustment
- WAC = total stock value / total stock quantity at that moment
- Source table: `stock_outwards`
- Voucher type: Journal, source_module: stock_outwards

### 3. Supplier Invoice / Purchase Voucher (inventory goods)

```
Dr Goods Received Not Invoiced        (taxable value)
Dr Input GST                          (input tax recoverable)
    Cr Trade Payables                 (gross = taxable + GST)
```

- GRNI is DEBITED to clear the accrual from goods receipt
- Purchase expense account is NOT used for inventory goods
- Source table: vouchers (via businessVoucherPayload or createBalancedVoucher)
- Voucher type: Purchase, source_module: business_voucher

### 4. Non-Inventory Purchase (services, consumables)

```
Dr Purchase Expense                   (taxable value)
Dr Input GST                          (input tax recoverable)
    Cr Trade Payables                 (gross)
```

- Used when `inventory_enabled === false` or explicitly `"0"`
- Source table: vouchers

### 5. Department Return (customer return to stock)

```
Dr Inventory                          (return quantity × WAC)
    Cr Cost of Goods Sold             (return quantity × WAC)
```

- Reverses the original stock outward
- Rate from current WAC at time of return
- Source table: `stock_returns` with return_type = 'Department'

### 6. Supplier Return (updated 10 Nov 2026 IST, owner decision CV)

```
Dr Goods Received Not Invoiced        (unbilled quantity × supplier's unbilled receipt price)
Dr Trade Payables                     (billed quantity × supplier's billed receipt price)
Dr/Cr Purchase Price Variance         (the gap to average cost; Dr when stock cost more)
    Cr Inventory                      (return quantity × WAC)
```

- The return is judged per item, supplier and order (owner decision C2: no link to a single receipt).
- GRNI is cleared first. The unbilled receipts are taken oldest first (by receipt date, then entry order), each at its stock value per unit; the value earlier returns already cleared from GRNI is taken off the oldest receipts first.
- The rest of the quantity comes off Trade Payables from the billed receipts in the same order, each at the supplier's rate (without freight or other landed cost), after the value earlier returns already took off Trade Payables. Quantity past every receipt is valued at WAC.
- A free (zero-price) receipt is taken at zero, after every priced receipt of the pool.
- Known limits of the pool (accepted with decision C2): a bill posted after a return, or a receipt entered with an earlier date, changes which receipts later returns are taken from; the difference ends up in Purchase Price Variance.
- Input GST on billed goods is not reversed by the return; that treatment is not yet decided.
- Stock always leaves at WAC. The difference between WAC and the supplier's own price goes to the **Purchase Price Variance** ledger (reported under Purchases; created per company, first free code from 5065).
- A return with no supplier clears GRNI while the company's GRNI balance is not yet cleared, else Trade Payables, at WAC, with no variance.
- A return with no order may have used any order's receipts, so it counts against later returns on every order (units are never cleared twice; some value may be left unused).
- The Trade Payables line names the supplier, so the return shows in the supplier's party ledger (returns posted before 10 Nov 2026 IST have no supplier link).
- The return itself reduces Trade Payables by the goods value of the billed part. **Do not also post a Debit Note for that value**, or the payable is reduced twice. The input GST on those goods is not reversed (see above).
- Source table: `stock_returns` with return_type = 'Supplier'

### 7. Stock Adjustment — Increase

```
Dr Inventory                          (adjustment quantity × rate/WAC)
    Cr Inventory Adjustment Gain      (adjustment value)
```

- Requires `approval_status === 'Approved'` before posting
- Source table: `stock_adjustments` with adjustment_type = 'Increase'

### 8. Stock Adjustment — Decrease

```
Dr Inventory Adjustment Loss          (adjustment value)
    Cr Inventory                      (adjustment quantity × rate/WAC)
```

- Requires `approval_status === 'Approved'` before posting
- Source table: `stock_adjustments` with adjustment_type = 'Decrease'

### 9. Damage, Loss, Obsolescence

Not yet implemented as a separate event type. Use Stock Adjustment Decrease (policy 8) to record losses. Full NRV/write-down governance deferred to FSR-R12.

### 10. Warehouse Transfer (same company)

Stock quantity/value moves between warehouses. No net company-level GL effect. The current implementation does not post a GL voucher for warehouse transfers.

### 11. Cross-Company Transfer

**REJECTED.** Cross-company account posting is blocked by `createBalancedVoucher` which verifies that every account belongs to the voucher's company. Cross-company stock operations fail with "Account belongs to a different company" error.

### 12. Opening Inventory

Deferred to FSR-2A.5. Opening inventory through the direct `accounts.opening_balance` bypass is NOT addressed by this phase.

## Account Resolution

Accounts are resolved by name via `accountId(db, companyId, accountName)` which queries:
```sql
SELECT id FROM accounts WHERE company_id = ? AND account_name = ? AND is_deleted = 0
```

Required accounts are created in DEFAULT_ACCOUNTS (init.js lines 209-238):
| Code | Name | Type | Normal |
|------|------|------|--------|
| 1400 | Inventory | Asset | Debit |
| 2010 | Goods Received Not Invoiced | Liability | Credit |
| 5050 | Cost of Goods Sold | Expense | Debit |
| 4060 | Inventory Adjustment Gain | Income | Credit |
| 5060 | Inventory Adjustment Loss | Expense | Debit |
| 5000 | Purchase | Expense | Debit |

## Guardrails

1. `ensureStockNotPosted()` — prevents posting an already-posted or already-reversed record
2. `postStockAdjustment` additionally requires `approval_status === 'Approved'`
3. `createBalancedVoucher` validates: positive amounts, balanced totals, active accounts, company ownership, open financial year
4. Atomic transaction wraps stock ledger + voucher + audit log
5. Audit log entry created for every inventory posting event
6. `reverseStockInward/Outward/Adjustment/Return` — atomic stock-ledger + GL reversal; rejects if already reversed; checks stock cannot go negative
7. LIFO reversal order enforced by the verifier but not by the function — caller must reverse events in reverse chronological order
8. `insertStockLedger` rejects stock going below -0.0001 (negative stock prevention)
9. Financial year lock prevents posting to closed FYs
10. Duplicate posting prevention via `ensureStockNotPosted` — also rejects reversed records
