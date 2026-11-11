# Fixture and Regression Report — FSR-2A.5B

# FSR-2A.5B Coverage Matrix

## A — Money Parsing (14 tests)

- [x] Zero, positive, negative, spaces, commas, empty, null
- [x] Malformed, NaN, Infinity, overflow, max safe
- [ ] String with Indian comma format
- [ ] Negative string input

## B — Money Arithmetic (9 tests)

- [x] Add, subtract, compare, sum, 0.10+0.20=0.30
- [x] Negative cancellation, reversal, safe result, signed-zero

## C — Rounding (8 tests)

- [x] Half-up boundaries, positive, negative, deterministic
- [x] Rate×quantity round, percentage calc

## D — Rate/Quantity/Tax (8 tests)

- [x] Fractional qty, allocation, tax, discount, multi-line allocation

## E — Real SQLite Migration (10+ tests needed)

- [ ] Migration on fresh database
- [ ] Migration on populated database
- [ ] Idempotency (apply twice)
- [ ] Backfill accuracy
- [ ] Rollback on interrupt
- [ ] Overflow rejection during backfill
- [ ] Disagreement detection
- [ ] Dry-run non-mutation
- [ ] Manifest completeness

## F — Accounting Posting (15+ tests needed)

- [ ] Voucher persistence with minor-unit columns
- [ ] Exact debit-credit equality in minor units
- [ ] One-paise imbalance rejection
- [ ] Reversal preserves minor-unit parity
- [ ] Opening balance in minor units
- [ ] Carry-forward in minor units
- [ ] Company isolation
- [ ] Voucher state filtering (Posted/Draft/Reversed)
- [ ] Sales, Purchase, Receipt, Payment, Contra, Journal, Credit/Debit Note
- [ ] Guided voucher posting

## G — Inventory (10+ tests needed)

- [ ] Stock/GL equality in minor units
- [ ] WAC lifecycle with integer value
- [ ] Inward, Outward, Return, Adjustment, Reversal
- [ ] Residual consumption
- [ ] Destination-year opening inventory

## H — Party and Tax (8+ tests needed)

- [ ] Customer/supplier opening in minor units
- [ ] Receipt/payment allocation parity
- [ ] GST calculation in minor units
- [ ] TDS in minor units
- [ ] Discount allocation
- [ ] Landed-cost allocation

## I — Reports (10+ tests needed)

- [ ] Trial Balance parity (REAL vs minor)
- [ ] P&L parity
- [ ] Balance Sheet parity
- [ ] Carry-forward parity
- [ ] Inventory value parity
- [ ] Party ledger parity
- [ ] Drill-down parity

## J — IPC and Renderer (5+ tests needed)

- [ ] IPC transport contract (integer vs string)
- [ ] Browser fallback consistency
- [ ] Renderer canonical input
- [ ] formatMoneyForDisplay in components

## K — Import/Export (8+ tests needed)

- [ ] Whole rupees, paise, negative
- [ ] Indian comma format
- [ ] Malformed separators
- [ ] Excessive decimals
- [ ] Overflow
- [ ] Repeated import
- [ ] Partial failure

## L — Boundaries (5 tests)

- [x] CURRENCY, MINOR_UNITS, RATE_PRECISION
- [x] assertMoney OK, rejects float, NaN, Infinity

## M — Regression (18 suites)

- [ ] FSR-2A.1 through FSR-2A.5A
- [ ] accounting, financials, controls, voucher-inventory, flow, phase10
- [ ] audit, database-graph, voucher-accounting-graph, workflow-enforcement
- [ ] safe-delete, fk-constraints, erp
- [ ] lint:syntax, build
