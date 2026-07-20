# FSR-1 Financial Report Risk Register

**Audit date:** 2026-07-20  
**Open risks:** 14 (3 closed by FSR-2A.1)  
**Overall gate:** BLOCKED

| ID | Severity | Finding | Evidence | Required phase | Status |
|---|---|---|---|---|---|
| FSR-R01 | CRITICAL | Balance Sheet mishandles contra assets/equity | Fixture difference -3,000 | FSR-2A.2 | OPEN |
| FSR-R02 | CRITICAL | Stock inward/adjustments/returns lack GL bridge | Stock +1,000, Inventory GL +0 | FSR-2A.4 | OPEN |
| FSR-R03 | CRITICAL | Purchase expense and outward COGS create hybrid/double-cost risk | Purchase Dr plus later COGS Dr | FSR-2A.4 | OPEN |
| FSR-R04 | CRITICAL | Balance Sheet current profit depends on arbitrary `date_from` | As-on expected 23,380, ERP 0 | FSR-2A.2 | OPEN |
| FSR-R05 | CRITICAL | Financial-year close cannot complete | `Invalid financial year status`, source remains Open | FSR-2A.3 | OPEN |
| ~~FSR-R06~~ | ~~CRITICAL~~ | ~~Draft/Cancelled voucher effects are not excluded by statements~~ | ~~Income changed +333~~ | ~~FSR-2A.1~~ | **CLOSED** |
| ~~FSR-R07~~ | ~~CRITICAL~~ | ~~Cross-company account references can contaminate reports~~ | ~~Bank changed +777~~ | ~~FSR-2A.1~~ | **CLOSED** |
| FSR-R08 | CRITICAL | Direct ledger opening balances can bypass double entry | `createLedgerAccount.opening_balance` | FSR-2A.5 | OPEN |
| ~~FSR-R09~~ | ~~HIGH~~ | ~~Empty posted vouchers are accepted~~ | ~~Executable empty-line probe~~ | ~~FSR-2A.1~~ | **CLOSED** |
| FSR-R10 | HIGH | No governed account group/mapping registry | Schema/UI trace | FSR-2B | OPEN |
| FSR-R11 | HIGH | Direct/indirect, current/non-current and contra mappings absent | COA matrix | FSR-2B | OPEN |
| FSR-R12 | HIGH | Inventory lacks NRV/write-down controls | AS 2 comparison | FSR-2A/2B | OPEN |
| FSR-R13 | HIGH | Money fields use ungoverned SQLite REAL representation | PRAGMA evidence | FSR-2A.5 | OPEN |
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

## Risk acceptance boundary

These findings cannot be accepted as cosmetic limitations. Operational screens may continue to be tested internally, but Trial Balance/P&L/Balance Sheet outputs must be labelled uncertified until the CRITICAL risks close and the populated verifier passes.

