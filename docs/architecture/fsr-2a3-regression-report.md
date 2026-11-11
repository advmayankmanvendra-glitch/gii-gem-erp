# FSR-2A.3 Regression Report

**Date:** 2026-07-20

## Summary

| Suite | Before | After | Delta |
|---|---|---|---|
| FSR-2A.3 | — | **37/37 PASS** | New |
| FSR-2A.2 | 25/25 PASS | **25/25 PASS** | No change |
| FSR-2A.1 | 22/22 PASS | **22/22 PASS** | No change |
| FSR-1 (verify:financial-reports) | 21/25 PASS | **21/25 PASS** | No change |

## FSR-2A.3 Individual Results

```
Passed: 37, Failed: 0, Total: 37
FSR-2A.3 CERTIFIED — READY FOR INVENTORY ACCOUNTING MODEL CORRECTIONS
```

## Files Changed

| File | Change |
|---|---|
| `src/main/services/accountingService.js` | Added `db` arg to `updateFinancialYearStatus` call; added status validations for source/destination; replaced normal_balance-based decomposition with account_type-aware decomposition |
| `src/main/database/reportBuilders.js` | Added carry-forward subqueries to `trialBalance()` (4 subquery params per account); added carry-forward subqueries to `balanceSheetReport()`; changed ledger entry scope to `BETWEEN fyStart AND dateTo`; `signedRowAmount` restored to original sign logic |
| `src/main/database/init.js` | Migration `033_fsr2a3_carry_forward_openings` (opening_debit/opening_credit columns) |
| `scripts/verify-fsr-2a3.js` | New verifier with 37 checks across validation, decomposition, consumption, and continuity |
| `package.json` | Added `verify:fsr2a3` script |

## Risk Register Update

| ID | Previously | Now |
|---|---|---|
| FSR-R05 | OPEN — Financial-year close cannot complete | **CLOSED** — Fixed |

## Certifications Affected

- FSR-2A.1 controls: **Preserved** (posting controls, company isolation, voucher state filtering)
- FSR-2A.2 controls: **Preserved** (signed-balance contract, current-profit FY scoping)

## Stop Conditions

No stop conditions are active. All verification suites pass at or above baseline level.

## Safe to Lock

**Yes.** FSR-2A.3 is certified with zero regressions across all active verification suites.
