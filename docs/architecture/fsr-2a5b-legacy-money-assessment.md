# Legacy Money Assessment — FSR-2A.5B

Assessment of the current REAL-based money representation:

## 1. Current state

ALL monetary values stored as SQLite REAL (64-bit IEEE 754 floating point)

## 2. Known floating-point issues

- 0.10 + 0.20 = 0.30000000000000004 (not exactly 0.30)
- `Math.round(0.595 * 100) / 100 = 0.59` not 0.60 (binary representation issue)
- Large account balances accumulate micro-errors over thousands of transactions
- Tax line rounding can produce 1-paise imbalances
- Voucher balance check (`Math.round(totalDebit * 100) === Math.round(totalCredit * 100)`) masks sub-paise errors

## 3. Current mitigations

- 2-decimal rounding on voucher balance check
- REAL values truncated at 2 decimal places in UI
- Reports use COALESCE and SUM on REAL columns

## 4. Risk assessment

| Risk | Level |
|---|---|
| Unreconciled 1-paise differences | MEDIUM |
| Accumulated drift over FY | LOW (most values are 2dp only) |
| Tax miscalculation | MEDIUM |
| Audit failure | LOW-MEDIUM |
| Inventory WAC accumulation | MEDIUM |

## 5. Migration impact

- No existing data loss (shadow columns are additive)
- All existing REAL values will be converted through governed rounding
- Backfill will produce exactly the same values as current UI display
- Users will see NO change in displayed amounts
- Only future calculations benefit from exact integer arithmetic

## 6. Go/No-Go criteria for FSR-R13 closure

- [ ] Shadow columns exist on ALL P1 tables
- [ ] Dual-write enabled on ALL P1 posting paths
- [ ] Backfill verification shows zero disagreements (within rounding tolerance)
- [ ] Trial balance in minor units = Trial balance in REAL (within 1 paise per account)
- [ ] All prior FSR suites pass
