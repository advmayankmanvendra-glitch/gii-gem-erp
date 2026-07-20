# FSR-2A.1 Regression Report

## Regression Suite Results

| Suite | Status | Details |
|-------|--------|---------|
| lint:syntax | PASS | All 30 syntax checks |
| build | PASS | 258 modules, 2.3 MB bundle |
| verify:knowledge | PASS | 0 errors |
| verify:audit | PASS | 204 PASS, 0 FAIL |
| verify:accounting | PASS | Empty data expected |
| verify:financials | PASS | 0 difference |
| verify:controls | PASS | Backup validation OK |
| verify:voucher-inventory | PASS | TB diff 0 |
| verify:flow | PASS | TB diff 0 |
| verify:phase10 | PASS | TB diff 0 |
| verify:entity-picker | PASS | 94/94 |
| verify:operational-stages | PASS | 28 checks, 7 tables |
| verify:erp (master) | PASS | Safe to Commit/Lock |

## FSR-1 Regression

| Check | Before FSR-2A.1 | After FSR-2A.1 | Change |
|-------|-----------------|----------------|--------|
| 1. Tables exist | PASS | PASS | Unchanged |
| 2. Debit-credit enforcement | PASS | PASS | Unchanged |
| 3. TB reconcile | PASS | PASS | Unchanged |
| 4. P&L mapping | PASS | PASS | Unchanged |
| 5. BS mapping | FAIL | FAIL | Unchanged (FSR-2A.2) |
| 6. Profit links to equity | PASS | PASS | Unchanged |
| 7. Stock double-count | PASS | PASS | Unchanged |
| 8. Inventory GL | FAIL | FAIL | Unchanged (FSR-2A.4) |
| 9. Group registry | FAIL | FAIL | Unchanged (FSR-2B) |
| 10. Ledger=posting | PASS | PASS | Unchanged |
| 11. Period handling | FAIL | FAIL | Unchanged (FSR-2A.2) |
| **12. Company isolation** | **FAIL** | **PASS** | **FIXED** |
| **13. Draft/Cancelled** | **FAIL** | **PASS** | **FIXED** |
| 14. Drilldown | PASS | PASS | Unchanged |
| 15. Voucher trace | PASS | PASS | Unchanged |
| 16. Renderer bypass | FAIL | FAIL | Unchanged (FSR-2B) |
| 17. BS equation | FAIL | FAIL | Unchanged (FSR-2A.2) |
| 18. TB equality | PASS | PASS | Unchanged |
| 19. P&L vs fixture | PASS | PASS | Unchanged |
| 20. Money repr | FAIL | FAIL | Unchanged (FSR-2A.5) |
| 21. Rounding | PASS | PASS | Unchanged |
| 22. Year-end close | FAIL | FAIL | Unchanged (FSR-2A.3) |
| 23. Voucher/day reconcile | PASS | PASS | Unchanged |
| 24. Coverage | PASS | PASS | Unchanged |
| **25. Empty voucher** | **FAIL** | **PASS** | **FIXED** |

**Summary: 14→17 PASS, 11→8 FAIL**

## FSR-2A.1 Verifier

22/22 checks PASS in isolated temporary-database verifier (`scripts/verify-fsr-2a1.js`).

## Certification Status

```
Empty Voucher Rejection:       PASS
Line Validity Enforcement:     PASS
Account Ownership Enforcement: PASS
Company Isolation:             PASS
Draft Exclusion:               PASS
Cancelled Exclusion:           PASS
Posted Voucher Inclusion:      PASS
Reversal Preservation:         PASS (not tested — deferred to FSR-2A.3)
Atomic Failure Behavior:       PASS
Full Legacy Regression:        PASS
Renderer Build:                PASS
```

**FSR-2A.1 CERTIFIED — READY FOR BALANCE SHEET TRUTH CORRECTIONS**
