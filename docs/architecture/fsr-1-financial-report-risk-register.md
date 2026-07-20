# FSR-1 Financial Report Risk Register

**Audit date:** 2026-07-20  
**Open risks:** 17  
**Overall gate:** BLOCKED

| ID | Severity | Finding | Evidence | Required phase |
|---|---|---|---|---|
| FSR-R01 | CRITICAL | Balance Sheet mishandles contra assets/equity | Fixture difference -3,000 | FSR-2A |
| FSR-R02 | CRITICAL | Stock inward/adjustments/returns lack GL bridge | Stock +1,000, Inventory GL +0 | FSR-2A |
| FSR-R03 | CRITICAL | Purchase expense and outward COGS create hybrid/double-cost risk | Purchase Dr plus later COGS Dr | FSR-2A |
| FSR-R04 | CRITICAL | Balance Sheet current profit depends on arbitrary `date_from` | As-on expected 23,380, ERP 0 | FSR-2A |
| FSR-R05 | CRITICAL | Financial-year close cannot complete | `Invalid financial year status`, source remains Open | FSR-2A |
| FSR-R06 | CRITICAL | Draft/Cancelled voucher effects are not excluded by statements | Income changed +333 | FSR-2A |
| FSR-R07 | CRITICAL | Cross-company account references can contaminate reports | Bank changed +777 | FSR-2A |
| FSR-R08 | CRITICAL | Direct ledger opening balances can bypass double entry | `createLedgerAccount.opening_balance` | FSR-2A |
| FSR-R09 | HIGH | Empty posted vouchers are accepted | Executable empty-line probe | FSR-2A |
| FSR-R10 | HIGH | No governed account group/mapping registry | Schema/UI trace | FSR-2B |
| FSR-R11 | HIGH | Direct/indirect, current/non-current and contra mappings absent | COA matrix | FSR-2B |
| FSR-R12 | HIGH | Inventory lacks NRV/write-down controls | AS 2 comparison | FSR-2A/2B |
| FSR-R13 | HIGH | Money fields use ungoverned SQLite REAL representation | PRAGMA evidence | FSR-2A |
| FSR-R14 | MEDIUM | Comparative reports absent | No backend contract/UI columns | FSR-2C |
| FSR-R15 | MEDIUM | Renderer assigns accounting groups heuristically | `classifyAccountGroup` | FSR-2B/2C |
| FSR-R16 | MEDIUM | CSV/print output is not statement-grade | Raw CSV export, no statutory metadata | FSR-2D/2E |
| FSR-R17 | MEDIUM | Existing financial verifier passes empty data | Prior report showed zero rows and zero totals | Verification governance |

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

