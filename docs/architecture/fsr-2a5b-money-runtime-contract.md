# Money Runtime Contract — FSR-2A.5B

**Effective for all modules** in the GII GeM ERP codebase.

---

## 1. Storage Contract

| Rule | Specification |
|------|---------------|
| Column type | INTEGER in `_minor` shadow columns |
| Unit | Paise (1 INR = 100 paise) |
| Sign | Signed integer (negative allowed for credit/debit representation) |
| Range | `Number.MIN_SAFE_INTEGER` to `Number.MAX_SAFE_INTEGER` (−9,007,199,254,740,991 to +9,007,199,254,740,991 paise) |
| Max major value | ~90 trillion INR (safe) |
| Legacy REAL columns | Must remain readable; all new writes go to `_minor` columns; REAL shadow-read during migration period |

---

## 2. Transport Contract (IPC)

| Rule | Specification |
|------|---------------|
| Preferred format | INTEGER minor units (paise) — safe integer range |
| Fallback format | Canonical decimal string e.g. `"1234.56"` — used when IPC serialization requires strings |
| Prohibited | Floating-point numbers with fractional paise; malformed strings |
| IPC channel naming convention | Append `_minor` to channel names that carry monetary payloads (e.g., `voucher:save_minor`) |

---

## 3. Display Contract

| Rule | Specification |
|------|---------------|
| Single entry point | `formatMoneyForDisplay(minor, currency?)` |
| Locale | `en-IN` (Indian numbering — 1,23,456.78) |
| Currency symbol | `₹` (INR default) |
| Fraction digits | Always 2 (paise) |
| No manual formatting | Any module displaying monetary amounts MUST call `formatMoneyForDisplay`. Direct `toFixed(2)` or template-string formatting is FORBIDDEN. |
| Zero display | `formatMoneyForDisplay(0)` → `"₹0.00"` |

---

## 4. Input Contract

| Rule | Specification |
|------|---------------|
| Single entry point | `parseMoneyToMinor(input)` |
| Accepted types | `number`, `string`, `null`, `undefined`, `""` |
| String format | Indian comma format accepted (`1,23,456.78`); commas and `₹` stripped |
| Whitespace | Leading/trailing spaces stripped |
| Null/undefined/empty | Return `0` (convenience for optional fields) |
| Negative | Accepted (signed integer minor). `parseMoneyToMinor("-500")` → `-500` |
| Overflow | `> Number.MAX_SAFE_INTEGER` → **throws** `"Money value exceeds safe range"` |
| Malformed | Non-numeric, non-decimal strings → **throws** `"Malformed money input"` |
| Non-finite | `Infinity`, `NaN` → **throws** `"Money value must be finite"` |

---

## 5. Arithmetic Contract

| Function | Signature | Contract |
|----------|-----------|----------|
| `addMoney` | `(...values: number[]) => number` | Sum of integer minor units. Returns `number` (safe integer). |
| `subtractMoney` | `(a: number, b: number) => number` | `a - b` in integer minor units. |
| `compareMoney` | `(a: number, b: number) => number` | Returns `a - b` (negative, zero, or positive). |
| `sumMoney` | `(values: number[]) => number` | Sum with `null`/`undefined`/missing treated as `0`. |
| `multiplyRateByQuantity` | `(rate: number, quantity: number) => number` | `rate` is raw REAL (4dp), `quantity` is raw REAL (3dp). Product → `Math.round()` → integer minor. |
| `calculatePercentage` | `(amountMinor: number, ratePct: number) => number` | `Math.round(amountMinor * ratePct / 100)`. Amount is already integer minor. |
| `allocateMoney` | `(total: number, shares: number[]) => number[]` | Proportional distribution with `Math.round`, residual distributed to first shares. Total is preserved exactly. |
| `roundToMinor` | `(value: number) => number` | `Math.round(value * 100)`. For unknown float values. |
| `exactEqual` | `(a: number, b: number) => boolean` | Strict `===` on integer minor values. |

---

## 6. Rounding Contract

| Operation | Method | Location |
|-----------|--------|----------|
| Input parsing | `Math.round(value * 100)` | `parseMoneyToMinor` |
| Rate × Quantity | `Math.round(rate * quantity)` | `multiplyRateByQuantity` |
| Percentage of amount | `Math.round(amountMinor * ratePct / 100)` | `calculatePercentage` |
| Allocation | `Math.round(share * total / sumShares)` + residual | `allocateMoney` |
| All operations | Half-up (`Math.round`) | Everywhere |
| No rounding | Summation of integer minor units | Report totals, Trial Balance, P&L, Balance Sheet |

---

## 7. Validation Contract

| Rule | Specification |
|------|---------------|
| Pre-write validation | `assertMoney(value)` before every database write of a `_minor` column |
| Integer check | `Number.isInteger(value)` — throws if float |
| Safe integer check | `Number.isSafeInteger(value)` — throws if overflow |
| Type check | Must be `number` — throws if `string`, `null`, `undefined`, etc. |
| Dual-write guard | After writing `_minor` column, legacy REAL column must be updated via `minorToMajor(value)` to stay in sync |

---

## 8. Conversion Contract

| Function | Signature | Description | Error Conditions |
|----------|-----------|-------------|------------------|
| `parseMoneyToMinor` | `(value: unknown) => number` | Converts any input to integer paise | Non-finite, malformed string, overflow |
| `minorToDecimalString` | `(value: number) => string` | Converts integer paise to `"1234.56"` string | Non-integer, unsafe integer, NaN |
| `minorToMajor` | `(value: number) => number` | Converts integer paise to decimal `number` | Delegates to `minorToDecimalString` |
| `formatMoneyForDisplay` | `(value: number, currency?: string) => string` | Formats as `₹ 1,23,456.78` | Non-integer, unsafe integer (via `minorToMajor`) |
| `convertLegacyMajorToMinor` | `(value: number) => number` | Delegates to `parseMoneyToMinor` | Same as `parseMoneyToMinor` |
| `convertMinorToLegacyMajor` | `(value: number) => number` | Delegates to `minorToMajor` | Same as `minorToMajor` |
| `roundToMinor` | `(value: number) => number` | Rounds any float to integer paise | Non-finite |
| `exactEqual` | `(a: number, b: number) => boolean` | Strict equality check | None |

---

## 9. Full API Reference

| Export | Signature | Return | Description | Throws |
|--------|-----------|--------|-------------|--------|
| `parseMoneyToMinor` | `(value: unknown) => number` | integer | Parse any input to integer paise | Non-finite, malformed, overflow |
| `minorToDecimalString` | `(value: number) => string` | `"d.dd"` | Integer paise → decimal string | Non-integer, unsafe, NaN |
| `minorToMajor` | `(value: number) => number` | float | Integer paise → major unit number | Via `minorToDecimalString` |
| `addMoney` | `(...values: number[]) => number` | integer | Sum of minor units | None (caller should pre-validate) |
| `subtractMoney` | `(a: number, b: number) => number` | integer | a − b in minor units | None |
| `compareMoney` | `(a: number, b: number) => number` | integer | a − b (comparison result) | None |
| `sumMoney` | `(values: number[]) => number` | integer | Sum with null/undefined as 0 | None |
| `multiplyRateByQuantity` | `(rate: number, qty: number) => number` | integer | rate × qty → rounded minor | Overflow |
| `calculatePercentage` | `(amtMinor: number, ratePct: number) => number` | integer | amt × ratePct / 100 → rounded minor | Overflow |
| `allocateMoney` | `(total: number, shares: number[]) => number[]` | integer[] | Proportional allocation | None (zero shares → zeroes) |
| `assertMoney` | `(value: number) => void` | void | Validate integer minor unit | Non-integer, non-number, unsafe |
| `formatMoneyForDisplay` | `(value: number, currency?: string) => string` | string | Locale-formatted currency string | Via `minorToMajor` |
| `convertLegacyMajorToMinor` | `(value: number) => number` | integer | Alias for `parseMoneyToMinor` | Same |
| `convertMinorToLegacyMajor` | `(value: number) => number` | float | Alias for `minorToMajor` | Same |
| `roundToMinor` | `(value: number) => number` | integer | `Math.round(value * 100)` | Non-finite |
| `exactEqual` | `(a: number, b: number) => boolean` | boolean | Strict integer equality | None |

---

## 10. Rate / Quantity / Percentage Contract (non-MONEY scaled types)

| Type | Precision | Shadow Column Suffix | Scale Factor | Max Safe Value |
|------|-----------|---------------------|--------------|----------------|
| RATE | 4 decimal places | `_scaled` | × 10⁴ | ~900 trillion / 10⁴ = ~90B rate units |
| QUANTITY | 3 decimal places | `_scaled` | × 10³ | ~9 quadrillion quantity units |
| PERCENTAGE | 4 decimal places | `_scaled` | × 10⁴ | ~900B percentage points |

**Rules:**
- Original `REAL` columns are retained for backward compatibility.
- New code reads/writes scaled-integer shadow columns.
- All arithmetic on scaled values uses `Math.round` for any division or multiplication.
- Rates are consumed as raw REAL by `multiplyRateByQuantity`; the function handles rounding.

---

## 11. Error Handling Summary

| Condition | Error Message | Raised By |
|-----------|---------------|-----------|
| `Infinity` or `NaN` input | `"Money value must be finite"` | `parseMoneyToMinor` |
| Malformed string | `"Malformed money input: ..."` | `parseMoneyToMinor` |
| Overflow (> MAX_SAFE_INTEGER) | `"Money value exceeds safe range"` | `parseMoneyToMinor`, `multiplyRateByQuantity`, `calculatePercentage` |
| Non-integer passed to assert | `"Money must be integer minor units"` | `assertMoney` |
| Non-number passed to assert | `"Money must be a number"` | `assertMoney` |
| Non-integer/unsafe to `minorToDecimalString` | `"Minor-unit value must be a safe integer"` | `minorToDecimalString` |
| Invalid input type | `"Invalid money input type: ..."` | `parseMoneyToMinor` |

---

## 12. Module Compliance Checklist

Every module that handles monetary, rate, quantity, or percentage values MUST:

- [ ] Import from `money.js` — never inline `Math.round(value * 100)`
- [ ] Use `parseMoneyToMinor` for all user/CSV/API input
- [ ] Use `formatMoneyForDisplay` for all display output
- [ ] Use `assertMoney` before every database write to `_minor` columns
- [ ] Use `allocateMoney` for proportional distributions
- [ ] Use `multiplyRateByQuantity` for rate × quantity products
- [ ] Use `calculatePercentage` for percentage-of-amount calculations
- [ ] Transport only integer minor units or canonical decimal strings over IPC
- [ ] Never parse, format, or round monetary values outside `money.js`
