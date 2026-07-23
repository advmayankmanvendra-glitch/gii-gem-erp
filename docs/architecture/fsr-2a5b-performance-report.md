# Performance Report — FSR-2A.5B

## 1. Storage Overhead

| Metric | Value |
|--------|-------|
| Shadow column type | INTEGER (8 bytes) |
| Original column type | REAL (8 bytes) |
| Additional rows | Same count as existing (shadow columns are additive) |
| Estimated increase | ~100% per monetary column (doubles storage for those columns) |
| **Actual measured** | [fill after dry run] |

> **Note:** This is worst-case per-column overhead. Only monetary columns are doubled; non-monetary columns are unaffected. Total database size increase depends on the ratio of monetary to non-monetary data.

---

## 2. Write Performance

### Single write
- `parseMoneyToMinor`: ~microseconds per call
- Extra column in INSERT: negligible at SQLite level

### Batch write (voucher with N lines)
- N × `parseMoneyToMinor` calls
- N × extra column in multi-row INSERT

### Measurement
- Measure: time to post 100 vouchers before vs after migration
- Tolerance: **< 10% increase** in total posting time

---

## 3. Read Performance

| Aspect | Expected Impact |
|--------|-----------------|
| Reading INTEGER vs REAL | Negligible at SQLite storage layer |
| Report aggregation (SUM) | SUM of INTEGERs is faster than SUM of REALs (no floating-point hardware in CPU codepath) |
| Overall expected | Neutral to slightly faster |

### Measurement
- Measure: report generation time for Trial Balance, P&L, Balance Sheet before vs after
- Target: no regression; improvement is acceptable

---

## 4. Conversion Performance

### Backfill
- Operation: `UPDATE table SET minor_column = ROUND(real_column * 100)` on millions of rows
- **Estimated:** [measure]
- **Acceptable:** completes within maintenance window (target: < 30 min for largest table)

### Migration stages
1. Schema change (DDL — fast)
2. Data backfill (DML — measured above)
3. Index rebuild (if applicable)
4. Verification (parity queries)

---

## 5. Memory

| Aspect | Expected Impact |
|--------|-----------------|
| JavaScript Number vs Integer | Same V8 representation for safe integer range (both stored as SMall Integer / HeapNumber) |
| Struct size in memory | No measurable difference for monetary values within ±2^53 |
| Overall | **No measurable impact** |

> All INR values stored fit within the safe integer range (max ~9×10^15 paise), so JavaScript's Number type uses the same internal representation for both REAL-derived and INTEGER-derived values.
