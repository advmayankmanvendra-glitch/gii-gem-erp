# FSR-1 Financial Report Risk Register

**Audit date:** 2026-07-24
**Open risks:** 9 (10 closed by FSR-2A.1–2A.5C)
**Overall gate:** PASS WITH WARNINGS (FSR-2A approved with conditions for FSR-2B; production packaging and release remain BLOCKED)

| ID | Severity | Finding | Evidence | Required phase | Status |
|---|---|---|---|---|---|
| ~~FSR-R01~~ | ~~CRITICAL~~ | ~~Balance Sheet mishandles contra assets/equity~~ | ~~Fixture difference -3,000~~ | ~~FSR-2A.2~~ | **CLOSED** |
| ~~FSR-R02~~ | ~~CRITICAL~~ | ~~Stock inward/adjustments/returns lack GL bridge~~ | ~~Stock +1,000, Inventory GL +0~~ | ~~FSR-2A.4~~ | **CLOSED** |
| ~~FSR-R03~~ | ~~CRITICAL~~ | ~~Purchase expense and outward COGS create hybrid/double-cost risk~~ | ~~Purchase Dr plus later COGS Dr~~ | ~~FSR-2A.4~~ | **CLOSED** |
| FSR-R18 | HIGH | Historical inventory/GL and Purchase/COGS remediation remains pending | Legacy stock movements and historical inventory purchases have not been backfilled or reconciled under the certified FSR-2A.4 model | Separate authorised historical-remediation phase | OPEN |
| ~~FSR-R04~~ | ~~CRITICAL~~ | ~~Balance Sheet current profit depends on arbitrary `date_from`~~ | ~~As-on expected 23,380, ERP 0~~ | ~~FSR-2A.2~~ | **CLOSED** |
| ~~FSR-R05~~ | ~~CRITICAL~~ | ~~Financial-year close cannot complete~~ | ~~`Invalid financial year status`, source remains Open~~ | ~~FSR-2A.3~~ | **CLOSED** |
| ~~FSR-R06~~ | ~~CRITICAL~~ | ~~Draft/Cancelled voucher effects are not excluded by statements~~ | ~~Income changed +333~~ | ~~FSR-2A.1~~ | **CLOSED** |
| ~~FSR-R07~~ | ~~CRITICAL~~ | ~~Cross-company account references can contaminate reports~~ | ~~Bank changed +777~~ | ~~FSR-2A.1~~ | **CLOSED** |
| ~~FSR-R08~~ | ~~CRITICAL~~ | ~~Direct ledger opening balances can bypass double entry~~ | ~~`createLedgerAccount.opening_balance`~~ | ~~FSR-2A.5A~~ | **CLOSED** |
| ~~FSR-R09~~ | ~~HIGH~~ | ~~Empty posted vouchers are accepted~~ | ~~Executable empty-line probe~~ | ~~FSR-2A.1~~ | **CLOSED** |
| FSR-R10 | HIGH | No governed account group/mapping registry | Schema/UI trace | FSR-2B | OPEN |
| FSR-R11 | HIGH | Direct/indirect, current/non-current and contra mappings absent | COA matrix | FSR-2B | OPEN |
| FSR-R12 | HIGH | Inventory lacks NRV/write-down controls | AS 2 comparison | FSR-2A/2B | OPEN |
| ~~FSR-R13~~ | ~~HIGH~~ | ~~Money fields use ungoverned SQLite REAL representation~~ | ~~PRAGMA evidence~~ | ~~FSR-2A.5~~ | **CLOSED** |
| FSR-R19 | HIGH | Historical REAL money data not yet backfilled/reconciled | No production DB migration executed | Separate authorised backfill phase | OPEN |
| FSR-R14 | MEDIUM | Comparative reports absent | No backend contract/UI columns | FSR-2C | OPEN |
| FSR-R15 | MEDIUM | Renderer assigns accounting groups heuristically | `classifyAccountGroup` | FSR-2B/2C | OPEN |
| FSR-R16 | MEDIUM | CSV/print output is not statement-grade | Raw CSV export, no statutory metadata | FSR-2D/2E | OPEN |
| FSR-R17 | MEDIUM | Existing financial verifier passes empty data | Prior report showed zero rows and zero totals | Verification governance | OPEN |

### FSR-2A.1 Risk Closures

**FSR-R06 — Draft/Cancelled voucher effects** (CRITICAL)
- Prior evidence: Income changed +333 after synthetic Draft/Cancelled postings
- Code correction: `postedVoucherFilter()` in `reportBuilders.js` added to TB, P&L, and BS queries — only `status = 'Posted'` vouchers contribute to financial statements
- Test evidence: FSR-2A.1 checks 12-14 PASS; FSR-1 check 13 changed from FAIL to PASS
- Remaining limitations: Drilldown queries intentionally exclude the filter (users must see all voucher states)
- Closure: **Verified — CRITICAL risk closed**

**FSR-R07 — Cross-company account contamination** (CRITICAL)
- Prior evidence: Company B posting using Company A account IDs changed Company A Bank by +777
- Code correction: `createBalancedVoucher()` validates every line's `account_id` belongs to the voucher's company, is active, and not deleted, before the transaction begins
- Test evidence: FSR-2A.1 checks 9-11 PASS; FSR-1 check 12 changed from FAIL to PASS; atomic failure confirmed (zero partial records)
- Remaining limitations: Database-level FK enforcement not implemented (deferred)
- Closure: **Verified — CRITICAL risk closed**

**FSR-R09 — Empty posted vouchers** (HIGH)
- Prior evidence: `createBalancedVoucher` accepted `lines: []`
- Code correction: `createBalancedVoucher()` requires at least 2 lines, at least one debit, at least one credit, and non-zero totals
- Test evidence: FSR-2A.1 checks 1-5 PASS; FSR-1 check 25 changed from FAIL to PASS
- Closure: **Verified — HIGH risk closed**

## Immediate stop conditions

The following Rule 27 stop conditions are active:

- accounting imbalance in a populated Balance Sheet fixture;
- inventory/database inconsistency;
- financial-year continuity failure;
- production readiness failure;
- missing certified statutory/report mapping;
- financial report verification failure.

No report redesign, statutory claim, release packaging or next major programme should begin. Permitted work is limited to FSR stabilization, corrective accounting work, verification, certification and lock activity.

### FSR-2A.2 Risk Closures

**FSR-R01 — Balance Sheet mishandles contra assets/equity** (CRITICAL)
- Prior evidence: Fixture difference −3,000 (the Balance Sheet equation showed Assets − Liabilities − Equity = −3,000 instead of 0)
- Root cause: `balanceSheetReport` used `normal_balance` to determine sign: Debit-balance accounts got `+1`, Credit-balance accounts got `−1`. This incorrectly negated contra-assets (Asset type, Credit normal balance → displayed as negative when they should appear as positive reductions) and failed to negate contra-equity (Equity type, Debit normal balance → displayed positive when they should reduce equity).
- Code correction: Introduced `signedRowAmount(row)` in `reportBuilders.js` that uses `account_type` for the sign rule, with `normal_balance` only for the opening-balance amount direction:
  - Asset + Debit → `+total`
  - Asset + Credit (contra) → `−abs(total)`
  - Liability/Equity + Credit → `+total`
  - Liability/Equity + Debit (contra) → `−abs(total)`
- Test evidence: FSR-2A.2 checks 1-9 and 18 PASS; FSR-1 checks 5 and 17 changed from FAIL to PASS
- Remaining limitations: The renderer still groups accounts heuristically; backend amount correctness is now certified
- Closure: **Verified — CRITICAL risk closed**

**FSR-R04 — Balance Sheet current profit depends on arbitrary `date_from`** (CRITICAL)
- Prior evidence: As-on-date Balance Sheet showed current profit = 0 when the caller passed a date_from that did not match the FY start
- Root cause: `balanceSheetReport` was calling `financialYearForDate(db, companyId, date_from)` to resolve the FY for the profit period start. If date_from fell before or after the FY, the FY lookup failed or returned the wrong year.
- Code correction: Changed to `financialYearForDate(db, companyId, dateTo)`. The Balance Sheet is an as-on-date statement — its current-profit period must start from the financial year containing `dateTo`, regardless of the caller's `date_from`. The P&L report remains period-based (date_from → dateTo).
- Test evidence: FSR-2A.2 checks 11a, 11b, 15-17 PASS; FSR-1 check 11 changed from FAIL to PASS
- Remaining limitations: If no FY exists for dateTo, current profit is 0 (documented behaviour)
- Closure: **Verified — CRITICAL risk closed**

### FSR-2A.4 Risk Closures

**FSR-R02 — Stock inward/adjustments/returns lack GL bridge** (CRITICAL)
- Prior evidence: Stock +1,000, Inventory GL +0 — stock movements had zero GL effect
- Code correction:
  - `postStockInward()`: Added Dr Inventory / Cr GRNI balanced journal voucher
  - `postStockOutward()`: Already posted Dr COGS / Cr Inventory — unchanged
  - `postStockAdjustment()`: Added Dr Inventory / Cr Inventory Adjustment Gain (Increase); Dr Inventory Adjustment Loss / Cr Inventory (Decrease)
  - `postStockReturn()`: Added Dr Inventory / Cr COGS (Department Return); Dr GRNI / Cr Inventory (Supplier Return, before invoice); Dr Trade Payables / Cr Inventory (Supplier Return, after invoice)
  - All GL vouchers use `createBalancedVoucher()` with `source_module` = stock_inwards/stock_outwards/stock_adjustments/stock_returns
  - All postings are wrapped in `db.transaction()` for atomicity
- Account provisioning: Added "Goods Received Not Invoiced" (2010, Liability/Credit), "Inventory Adjustment Loss" (5060, Expense/Debit) and "Inventory Adjustment Gain" (4060, Income/Credit) to DEFAULT_ACCOUNTS
- `businessVoucherPayload` for purchase: Uses GRNI (not Inventory/ Purchase) for inventory-enabled items
- Test evidence: FSR-2A.4 verifier 55/55 PASS (FSR-2A.4C hardening added 16 checks: reversals, supplier-return after invoice, adj account split, locked-year, duplicate posting, coverage matrix); FSR-1 check 8 changed from FAIL to PASS
- Remaining limitations: Atomic reversal added (LIFO-order), supplier-return after invoice distinguished, adj accounts split; no auto-reversal UI, no historical FY backfill
- Closure: **Verified — CRITICAL risk closed**

**FSR-R03 — Purchase expense and outward COGS double-cost risk** (CRITICAL)
- Prior evidence: Purchase Dr 1000 + COGS Dr 300 = 1300 total expense for goods worth 1000
- Code correction:
  - `businessVoucherPayload` for `inventory_enabled: true` purchase vouchers debits "Goods Received Not Invoiced" instead of "Purchase"
  - Non-inventory purchases continue to debit "Purchase" account
  - Stock outward debits COGS at weighted-average cost
  - No single inventory item can be expensed through both Purchase and COGS
- Test evidence: FSR-2A.4 checks 29 (uses GRNI, not Inventory) and 30 (non-inventory uses Purchase) PASS; complete purchase-to-sale lifecycle verified
- Remaining limitations: Backward compatibility with historical Purchase-debit transactions not addressed
- Closure: **Verified — CRITICAL risk closed**

### FSR-2A.3 Risk Closure

**FSR-R05 — Financial-year close cannot complete** (CRITICAL)
- Prior evidence: `closeFinancialYear` called `updateFinancialYearStatus(fromId, "Locked", approvedBy)` without the `db` argument. The signature is `(db, id, status, userId)`, so `approvedBy` was passed as `status`, causing "Invalid financial year status" errors. The source FY remained `Open` and could not transition to `Locked`.
- Code correction:
  - Added `db` argument: `updateFinancialYearStatus(db, fromId, "Locked", approvedBy)` — primary defect fixed
  - Added source/destination status validations — `closeFinancialYear` now requires both FYs to be `'Open'` (lines 914-915)
  - Added overlap check — `toYear.start_date <= fromYear.end_date` (line 916)
  - Fixed carry-forward decomposition — account-type-aware decomposition of `signedRowAmount` into `opening_debit`/`opening_credit` (lines 942-949)
  - Added carry-forward consumption — `trialBalance` and `balanceSheetReport` incorporate `carry_forward_entries` via correlated subqueries
  - Added migration `033_fsr2a3_carry_forward_openings` — adds `opening_debit`/`opening_credit` columns to `carry_forward_entries`
- Test evidence: FSR-2A.3 37/37 PASS; FSR-2A.2 25/25 PASS; FSR-2A.1 22/22 PASS; FSR-1 21/25 PASS (no regression)
- Remaining limitations: No gap validation (FYs with a gap between source end and target start are accepted); inventory accounts (Stock, COGS) are excluded from carry-forward opening consumption (deferred to FSR-2A.4)
- Closure: **Verified — CRITICAL risk closed**

### FSR-2A.4 Historical Residual Risk

**FSR-R18 — Historical inventory/GL and Purchase/COGS remediation remains pending** (HIGH)

- Finding: FSR-2A.4 and FSR-2A.4C certify the prospective inventory-accounting paths. Historical stock movements and historical inventory purchases created before the certified implementation may still contain missing Inventory GL postings or Purchase-and-COGS double-cost effects.
- Current correction: New stock inward, outward, return, adjustment, supplier-invoice and reversal paths now follow the certified perpetual-inventory and GRNI contracts.
- Test evidence: FSR-2A.4C verifier passed 55/55 checks, including inventory reversals, supplier-return lifecycle, adjustment-account separation, locked-year enforcement and duplicate-posting prevention.
- Historical limitation: No authorised backfill, adjustment voucher pack or production-database reconciliation has yet been executed for legacy transactions.
- Required action: Perform a separately authorised, read-only historical reconciliation followed by an approved dry-run remediation programme. Any correction must preserve original evidence and use governed adjustment or reversal entries rather than silent data rewriting.
- Closure: **OPEN — prospective paths certified; historical remediation remains pending**

### FSR-2A.5 Risk Closure

**FSR-R13 — Money fields use ungoverned SQLite REAL representation** (HIGH)
- Prior evidence: 74 MONEY fields (13 RATE, 31 QUANTITY, 12 PERCENTAGE) stored as SQLite REAL without governing contract
- Code correction:
  - Created `src/main/domain/money.js` — governed money utility with 17 functions: `parseMoneyToMinor`, `minorToDecimalString`, `minorToMajor`, `addMoney`, `subtractMoney`, `compareMoney`, `multiplyRateByQuantity`, `calculatePercentage`, `allocateMoney`, `assertMoney`, `assertSafeMoney`, `sumMoney`, `formatMoneyForDisplay`, `convertLegacyMajorToMinor`, `convertMinorToLegacyMajor`, `roundToMinor`, `exactEqual`
  - All new writes go through `parseMoneyToMinor` → Safe Integer minor units (paise)
  - Added 13 INTEGER `_minor` shadow columns across 7 tables (voucher_lines, ledger_entries, opening_balances, carry_forward_entries, accounts, stock_ledger, stock_valuation_ledger)
  - Migration 034 `fsr2a5b_money_shadow_columns` calls `addMoneyShadowColumns()` to create columns and backfill
  - Dual-write implemented in `accountingService.js` (createBalancedVoucher, createPartyOpeningBalance, createOpeningBalance, closeFinancialYear) and `inventoryService.js` (insertStockLedger, stockBalance)
  - Report cutover: trialBalance, profitLossReport, balanceSheetReport, dayBook, gstSummary now read authoritative minor-unit columns with REAL\*100 COALESCE fallback
  - Created `src/main/domain/moneyCompatibility.js` — migration state machine and disagreement policy (not_migrated, migrated_agrees, migrated_disagrees)
  - Import validation (`importValidationService.js`) updated to use `parseMoneyToMinor` for all monetary fields
  - Created `scripts/verify-fsr-2a5b.js` — 89 tests across 11 sections (A–K), all PASS
- Test evidence: FSR-2A.5B verification **89/89 PASS**; full regression (22 suites) PASS; accounting/financials PASS
- Remaining limitations: Historical REAL data in production databases not yet backfilled; renderer-side display formatting not yet governed to `formatMoneyForDisplay`; IPC transport uses major-unit floats (renderer expects them)
- Closure: **Verified — HIGH risk closed for prospective paths. Historical money data remediation moved to FSR-R19.**

### FSR-2A.5C Consolidated Recertification

**FSR-2A.5C — Consolidated Accounting-Truth Recertification** (CLOSED — all 34 tests PASS)

The FSR-2A.5C verifier (`scripts/verify-fsr-2a5c.js`) consolidates all prior FSR-2A controls into a single certification programme:

| Section | Tests | Purpose |
|---------|-------|---------|
| 1-2. Fixture & Source-of-Truth | C1–C11 | Voucher balance, ledger equality, company/FY isolation, draft/cancelled exclusion, opening equality |
| 3. Minor-Unit Authority | C12–C15 | Legacy REAL isolation, report minor-preference, exact reversal, safe integers |
| 4. Report Recertification | C16–C20 | Trial Balance exact equality, P&L income/expense, net profit, Balance Sheet equation |
| 5. Inventory & GL Bridge | C21–C25 | Inventory GL = stock ledger, GRNI clearing, COGS single recognition, stock lifecycle |
| 6. Party Reconciliation | C26–C27 | Trade Receivables GL, Trade Payables GL with credit-normal sign convention |
| 7. Financial-Year Continuity | C28–C30 | Full 16-account carry-forward, balanced opening, source-year continuity |
| 8. Migration & Compatibility | C31–C34 | Shadow-column idempotency, backfill parity, dry-run non-mutation, negative handling |

**Key technical fix (C20):** Balance Sheet equation used `signedMovement` for the Asset side, which computes `credit-debit` for credit-normal accounts. Contra-asset accounts (Accumulated Depreciation, Asset type / Credit normal) were incorrectly treated as increasing net assets. Fixed by using raw `debit_minor - credit_minor` aggregation instead, which correctly shows contra-asset credits reducing net assets. The discrepancy was exactly 2× the Accum Depr movement (1,000,000 paise).

**Result: 34/34 PASS — FSR-2A ACCOUNTING TRUTH CERTIFIED.** All 17 certification categories PASS. Regression: FSR-2A.5A (81/81), FSR-2A.5B (89/89).

**FSR-R19** remains OPEN — historical REAL-money data in production databases has not been backfilled or reconciled. This is a separate authorised remediation phase.

## Risk acceptance boundary

The prospective accounting implementation is certified by populated FSR-2A
fixtures. Trial Balance, Profit and Loss, and Balance Sheet amounts may be used
for internal testing on fresh or approved non-production data.

This certification does not close historical or release risks:

- FSR-R18 remains OPEN for historical inventory/GL and Purchase/COGS
  remediation.
- FSR-R19 remains OPEN for historical production money migration and
  reconciliation.
- Production packaging remains BLOCKED until RMD-1 and applicable historical
  remediation controls are separately certified.
- FSR-2B may not alter the certified accounting source-of-truth contracts.

### FSR-2A-L1 Stabilization Update - 2026-07-24

- Focused reproduction: FSR-2A.1 22/22, FSR-2A.2 25/25, FSR-2A.3 37/37,
  FSR-2A.4 55/55, FSR-2A.5A 81/81, FSR-2A.5B 89/89, and FSR-2A.5C 34/34
  PASS.
- Populated FSR-1 verifier: 23/25 PASS WITH WARNINGS. Only FSR-2B Check 9
  (mapping registry) and Check 16 (renderer heuristic classification) remain.
- Check 20 now passes an executable populated minor-unit authority,
  reconciliation, report-preference, and mismatch-detection test.
- Full ERP regression, renderer build, and Electron accounting smoke test pass.
- FSR-R18: OPEN.
- FSR-R19: OPEN.
- Programme lock: FSR-2A accounting truth is certified and locked with
  conditional approval for FSR-2B. The approval becomes effective only when
  the annotated tag `fsr-2a-accounting-truth-lock-2026-07-24` points to the
  lock commit containing the completed lock document set and is pushed.
- FSR-R18 remains OPEN. FSR-R19 remains OPEN. RMD-1 remains BLOCKED.
- Production packaging and release remain BLOCKED.
