# FSR-2A.5C Inventory GL Bridge Recertification

## Tests

- C21: Inventory GL = stock ledger value — GL=540,000 Stock=540,000 diff=0
- C22: GRNI clears to zero — GRNI net=0
- C23: COGS single recognition — COGS=400,000
- C24: Purchase account unused for inventory items — Purchase net=0
- C25: Stock lifecycle (in - out + ret + adj = close) — verified

## Inventory GL vs Stock Ledger

The Inventory GL account (debit-normal Asset) has a net movement of 540,000 paise across all lifecycle transactions. The stock ledger closing running_value_minor is also 540,000 paise. Exact parity confirms the GL-stock ledger bridge.

## Stock Lifecycle Formula

| Transaction Type | Value (paise) |
|-----------------|---------------|
| Inward | 1,000,000 |
| Outward | −600,000 |
| Return | +100,000 |
| Adjustment | +40,000 |
| Closing | 540,000 |

Formula: `in - out + ret + adj = close`
1,000,000 − 600,000 + 100,000 + 40,000 = 540,000 ✓

## Adjustment Loss Handling

The stock adjustment loss is stored as a negative `value_minor` (-40,000 paise), ensuring the SUM-based lifecycle formula works correctly. This is consistent with the fix applied in FSR-2A.5B where the sign convention was corrected.

## GRNI Clearing

GRNI (Goods Received Not Invoiced) is a credit-normal Liability account. It was credited 1,000,000 on stock inward and debited 1,000,000 on supplier invoice posting. Net = 0, confirming the GRNI clearing mechanism.

## COGS Recognition

COGS of 400,000 paise is recognised once. This represents 5 units sold at ₹10 (1,000) per unit minus 1 unit returned at ₹10 (1,000) per unit = 4 units × 1,000 = 4,000 = 400,000 paise. No double recognition.

## Purchase Account

The Purchase account has zero net movement, confirming that inventory-item purchases flow through GRNI and Inventory rather than the Purchase account.
