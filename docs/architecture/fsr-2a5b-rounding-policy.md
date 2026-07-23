# Rounding Policy — FSR-2A.5B

**Rounding method:** `Math.round` (half-up) throughout all financial computations.

**Currency:** INR | **Minor unit:** 100 paise = 1 rupee | **Safe integer range:** ±9,007,199,254,740,991 paise

---

## Rounding Stage 1: Input Rounding

| Property | Value |
|----------|-------|
| **What is rounded** | User-entered major-unit amount (e.g. `1234.56`) |
| **When** | At the boundary — when the UI value reaches `parseMoneyToMinor()` |
| **Method** | `Math.round(value * 100)` |
| **Location** | `parseMoneyToMinor` in `src/main/domain/money.js` |
| **UI pre-rounding** | **Forbidden.** The UI must pass the raw user-entered value. Only `parseMoneyToMinor` performs rounding. |
| **One-paise risk** | None — input is single-amount, no distribution. |
| **Mitigation** | Input validation in `parseMoneyToMinor` rejects non-finite and malformed values. |

**Rationale:** A user enters `1234.567` intending `1234.57`. `Math.round(1234.567 * 100)` → `Math.round(123456.7)` → `123457` paise = `₹1234.57`. The user's intent is honored.

---

## Rounding Stage 2: Rate × Quantity

| Property | Value |
|----------|-------|
| **What is rounded** | The product `rate × quantity` → intermediate value rounded to integer paise |
| **When** | During inventory valuation, billing line computation, procurement line computation |
| **Method** | `Math.round(rate * quantity)` |
| **Location** | `multiplyRateByQuantity(rate, quantity)` in `money.js` |
| **Rate precision** | 4 decimal places (REAL), stored as-is in legacy column |
| **Quantity precision** | 3 decimal places (REAL), stored as-is in legacy column |
| **One-paise risk** | Yes — floating-point product before rounding may produce a result that differs from exact arithmetic by < 1 paise. |
| **Mitigation** | `Math.round` absorbs the floating-point noise. `Number.isSafeInteger` guard on result. |

**Example:**
```
rate = 1234.5678  (4dp)
qty  = 10         (integer)
product = 12345.678
Math.round(12345.678) = 12346 paise = ₹123.46
```

---

## Rounding Stage 3: Percentage of Amount

| Property | Value |
|----------|-------|
| **What is rounded** | `amountMinor × ratePct / 100` |
| **When** | GST calculation, TDS calculation, discount computation, expense percentage computation |
| **Method** | `Math.round(amountMinor * ratePct / 100)` |
| **Location** | `calculatePercentage(amountMinor, ratePct)` in `money.js` |
| **Amount** | Already integer minor units (paise) |
| **Percentage precision** | 4 decimal places (e.g., `18.0000` for 18% GST) |
| **One-paise risk** | Yes — when `amountMinor × ratePct` is not evenly divisible by 100. |
| **Mitigation** | Single rounding at the final stage. No intermediate rounding on the product. |

**Example (GST):**
```
taxableValue = 10000000 paise (₹100,000.00)
gstRate = 18
gstAmount = Math.round(10000000 * 18 / 100) = Math.round(1800000) = 1800000 paise = ₹18,000.00
```

**Example (discount):**
```
amountMinor = 50000 paise (₹500.00)
discountPct = 10
discount = Math.round(50000 * 10 / 100) = Math.round(5000) = 5000 paise = ₹50.00
```

---

## Rounding Stage 4: Allocation (Proportional Distribution)

| Property | Value |
|----------|-------|
| **What is rounded** | Each individual share: `Math.round(total × share / sumShares)` |
| **When** | Payment allocation to invoices, tax line distribution across items, expense distribution across orders |
| **Method** | `Math.round` per share, then residual sweep to first shares |
| **Location** | `allocateMoney(total, shares)` in `money.js` |
| **One-paise risk** | Inherent in proportional distribution — rounding each share independently will cause a residual. |
| **Mitigation** | Residual distribution loop: after all shares are rounded, the remainder (which can be at most `n-1` paise) is distributed one paise at a time to the first shares in order. **Total is guaranteed to be preserved exactly.** |

**Algorithm:**
```
results = shares.map(share => Math.round(total * share / sumShares))
remainder = total - sum(results)
idx = 0
while remainder != 0:
    results[idx % len(results)] += sign(remainder)
    remainder -= sign(remainder)
    idx++
```

**Example (3-line invoice, ₹100 total):**
```
shares = [33.33, 33.33, 33.34]
raw:    [Math.round(3333), Math.round(3333), Math.round(3334)]
       = [3333, 3333, 3334]
sum    = 10000 paise ✓ (₹100.00 exact)
```

**Example (residual):**
```
total = 10000 paise (₹100.00)
shares = [3, 3, 3]
raw = [Math.round(3333.33), Math.round(3333.33), Math.round(3333.33)]
    = [3333, 3333, 3333]
sum = 9999
remainder = 1
→ results[0] += 1 → [3334, 3333, 3333]
sum = 10000 ✓
```

---

## Rounding Stage 5: Tax Line Allocation (Multi-Line GST)

| Property | Value |
|----------|-------|
| **What is rounded** | Per-item GST amount when distributing total GST across invoice/procurement lines |
| **When** | During multi-line invoice/procurement tax computation |
| **Method** | Delegates to `allocateMoney(totalGstMinor, lineTaxableShares)` |
| **One-paise risk** | Same as Stage 4 — residual handled by `allocateMoney` |
| **Mitigation** | `allocateMoney` guarantees exact total preservation. |

---

## Rounding Stage 6: Discount Distribution

| Property | Value |
|----------|-------|
| **What is rounded** | Per-line discount amount when a total discount is distributed across lines |
| **When** | Trade discount, volume discount, scheme discount |
| **Method** | `Math.round(amountMinor × discountPct / 100)` or `allocateMoney(totalDiscount, lineShares)` |
| **One-paise risk** | Same as Stage 3 (single line) or Stage 4 (multi-line) |
| **Mitigation** | Single Math.round for single line; allocateMoney for multi-line |

---

## Rounding Stage 7: COGS Rounding (Outward Posting)

| Property | Value |
|----------|-------|
| **What is rounded** | `outwardQuantity × weightedAverageCost` |
| **When** | At outward stock posting (stock_outwards → stock_ledger) |
| **Method** | `Math.round(outwardQty × weightedAvgCost)` |
| **Weighted average cost** | Computed as `running_value_minor / running_quantity_scaled` (ratio of two integers), giving a raw float |
| **One-paise risk** | Yes — the product of float cost × float qty may differ from exact rational arithmetic |
| **Mitigation** | Single `Math.round` to integer paise. The `value_minor` and `running_value_minor` columns always hold exact integer paise. |

**Sequence:**
```
1. running_value_minor = 5000000 paise (₹50,000.00)
2. running_quantity_scaled = 10000 (10.000 units)
3. weightedAvgCost = 5000000 / 10000 = 500.0 paise/unit
4. outward_qty = 5.000 → scaled = 5000
5. COGS = Math.round(5000 * 500.0) = Math.round(2500000) = 2500000 paise = ₹25,000.00
6. new running_value_minor = 5000000 - 2500000 = 2500000 paise
```

---

## Rounding Stage 8: Inventory GL Posting

| Property | Value |
|----------|-------|
| **What is rounded** | Same product as COGS — `quantity × weightedAverageCost` |
| **When** | When stock_ledger value posts to GL (ledger_entries) |
| **Method** | Same as COGS — `Math.round` |
| **One-paise risk** | Same as COGS |
| **Mitigation** | The GL debit/credit for inventory must equal the `value_minor` of the outward stock_ledger entry. **No second rounding** — the already-rounded COGS value is reused. |

---

## Rounding Stage 9: Year-End Carry-Forward

| Property | Value |
|----------|-------|
| **What is rounded** | Nothing — amounts are already integer minor units |
| **When** | Year-end closing process |
| **Method** | Direct transfer of integer `_minor` column values |
| **One-paise risk** | **Zero.** All amounts are exact integer paise from ledger. |
| **Mitigation** | The `closing_balance_minor` from the current year → `opening_balance_minor` for next year. No conversion, no rounding. |

---

## Rounding Stage 10: Report Totals

| Property | Value |
|----------|-------|
| **What is rounded** | Nothing |
| **When** | Trial Balance, P&L, Balance Sheet, Ledger Summation |
| **Method** | `sumMoney()` — exact summation of integer minor units |
| **One-paise risk** | **Zero.** Summation of integers produces exact integer. |
| **Mitigation** | Totals are computed in integer paise. Display conversion via `minorToDecimalString` at final output. |

---

## No-Rounding Zones

The following computations are exact integer sums and MUST NOT be rounded:

| Zone | Computed From | Reason |
|------|---------------|--------|
| Trial Balance totals | `ledger_entries.debit_minor` / `credit_minor` | Sum of integers = exact |
| P&L net profit | `income sum − expense sum` | Exact integer difference |
| Balance Sheet total | `assets − liabilities − equity` | Exact integer difference |
| Carry-forward values | `closing_balance_minor` | Direct transfer |
| Aggregated ledger balances | `running_balance_minor` | Running sum of integers |
| Payment allocation totals | `allocateMoney` outputs | Algorithm guarantees total preservation |
| Report grand totals | `sumMoney` of integer lines | Sum of integers = exact |

---

## Single-Rounding Principle

**Every individual financial value is rounded exactly once.**

- A value that enters the system is rounded once at `parseMoneyToMinor`.
- A value computed from other values is rounded once at the computation site.
- A value that equals another value (e.g., COGS → GL posting) MUST reuse the already-rounded value — NEVER re-round.

**Violation example (FORBIDDEN):**
```
// BAD: two rounding points for the same value
stockLedger.value_minor = Math.round(qty * cost)  // round 1
ledgerEntry.debit_minor  = Math.round(qty * cost)  // round 2 — may differ!
```

**Correct pattern:**
```
// GOOD: single rounding, value reused
const cogs = Math.round(qty * cost)
stockLedger.value_minor = cogs
ledgerEntry.debit_minor = cogs  // reuse, no re-rounding
```

---

## Stage Summary

| Stage | What Is Rounded | Pipeline Location | Method | 1-paise Risk | Mitigation |
|-------|----------------|-------------------|--------|--------------|------------|
| 1 — Input | User amount → paise | `parseMoneyToMinor` | `Math.round(v × 100)` | No | Single value, no distribution |
| 2 — Rate×Qty | rate × quantity | `multiplyRateByQuantity` | `Math.round(rate × qty)` | Yes | Safe integer guard |
| 3 — Percentage | amt × pct / 100 | `calculatePercentage` | `Math.round(amt × pct / 100)` | Yes | Single rounding at final stage |
| 4 — Allocation | Each share of total | `allocateMoney` | `Math.round` + residual sweep | Yes (per share) | Residual guarantees exact total |
| 5 — Tax lines | Per-line GST | `allocateMoney` | Same as Stage 4 | Yes (per line) | Same as Stage 4 |
| 6 — Discount | amt × discount / 100 | `calculatePercentage` or `allocateMoney` | Same as Stage 3 or 4 | Yes | Same as Stage 3 or 4 |
| 7 — COGS | qty × avg cost | Outward posting | `Math.round(qty × cost)` | Yes | Single rounding, reused in GL |
| 8 — Inventory GL | Same as COGS | GL posting | **Reuse** COGS value | **No** | Reuse, not re-round |
| 9 — Carry-forward | Nothing | Year-end | Direct integer transfer | **Zero** | Exact integer passthrough |
| 10 — Report totals | Nothing | Report generation | `sumMoney` of integers | **Zero** | Exact integer summation |

---

## Enforcement

- New code MUST use `money.js` exports for all rounding operations.
- Code review MUST verify the Single-Rounding Principle: trace each value to ensure it is rounded exactly once.
- Any `Math.round` outside `money.js` is a compliance violation unless explicitly approved in an architecture review.
- The `assertMoney` guard at database write time catches non-integer values that indicate a missed rounding step.
