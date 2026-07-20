# FSR-2A.2 Balance Sheet Truth — Correction Report

## Scope

Correct contra-asset/contra-equity handling and fix as-on-date current profit computation in the Balance Sheet.

## Files Changed

### `src/main/database/reportBuilders.js`

**New helper — `signedRowAmount(row)`**

Computes the signed Balance Sheet amount based on `account_type` rather than `normal_balance`. See `docs/architecture/fsr-2a2-signed-balance-contract.md` for full rule table.

**Changed — `balanceSheetReport()`**

1. **Amount formula:** Replaced `normal_balance`-based sign with `signedRowAmount()` for every ledger row grouped into Asset, Liability, and Equity sections.
2. **Current-profit date range:** Changed from `financialYearForDate(db, companyId, date_from)` to `financialYearForDate(db, companyId, dateTo)` for the P&L period start. The P&L report remains period-based (date_from → dateTo); the Balance Sheet as-on-date uses the correct FY start for current-year profit linkage.
3. **Posted-voucher filter:** `postedVoucherFilter()` applied (inherited from FSR-2A.1).

**Unchanged — `trialBalance()` and `profitLossReport()`**

Raw debit/credit amounts preserved. Posted-voucher filter added in FSR-2A.1 remains.

## Before/After Comparison

| Scenario | Before | After |
|---|---|---|
| Bank (Asset/Debit) 57,000 | +57,000 | +57,000 |
| Accum. Depr (Asset/Credit) 1,000 | +1,000 | −1,000 |
| Payables (Liability/Credit) 5,000 | −5,000 | +5,000 |
| Capital (Equity/Credit) 50,000 | −50,000 | +50,000 |
| Drawings (Equity/Debit) 3,000 | +3,000 | −3,000 |
| BS equation | −3,000 imbalance | 0 balance |
| As-on-date profit (Apr→Dec) | 0 (no FY match) | 9,000 (correct) |

## Risks Closed

- **FSR-R01** (CRITICAL — Contra asset/equity mishandling) — CLOSED
- **FSR-R04** (CRITICAL — Current profit depends on arbitrary date_from) — CLOSED

## Remaining FSR-1 Failures (5)

| Check | Issue | Phase |
|---|---|---|
| 8 | Inventory GL does not reconcile with stock subledger | FSR-2A.4 |
| 9 | No governed account-group/report-mapping registry | FSR-2B |
| 16 | Renderer assigns accounting groups heuristically | FSR-2B |
| 20 | Money fields use ungoverned SQLite REAL | FSR-2A.5 |
| 22 | Financial-year close cannot complete | FSR-2A.3 |

## Certification

FSR-2A.2 verifier: **25/25 PASS** (isolated fixture).
FSR-1: **20 PASS, 5 FAIL** (3 checks promoted from FAIL to PASS: 5, 11, 17).
All 13 regression suites: **PASS**.
