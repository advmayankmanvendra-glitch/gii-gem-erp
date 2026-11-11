# FSR-2A.2 Regression Report

## Regression Suite Results

| Suite | Status | Details |
|-------|--------|---------|
| lint:syntax | PASS | All syntax checks |
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

| Check | Before FSR-2A.2 | After FSR-2A.2 | Change |
|-------|-----------------|----------------|--------|
| 1. Tables exist | PASS | PASS | Unchanged |
| 2. Debit-credit enforcement | PASS | PASS | Unchanged |
| 3. TB reconcile | PASS | PASS | Unchanged |
| 4. P&L mapping | PASS | PASS | Unchanged |
| **5. BS mapping** | **FAIL** | **PASS** | **FIXED** |
| 6. Profit links to equity | PASS | PASS | Unchanged |
| 7. Stock double-count | PASS | PASS | Unchanged |
| 8. Inventory GL | FAIL | FAIL | Unchanged (FSR-2A.4) |
| 9. Group registry | FAIL | FAIL | Unchanged (FSR-2B) |
| 10. Ledger=posting | PASS | PASS | Unchanged |
| **11. Period handling** | **FAIL** | **PASS** | **FIXED** |
| 12. Company isolation | PASS | PASS | Unchanged (FSR-2A.1) |
| 13. Draft/Cancelled | PASS | PASS | Unchanged (FSR-2A.1) |
| 14. Drilldown | PASS | PASS | Unchanged |
| 15. Voucher trace | PASS | PASS | Unchanged |
| 16. Renderer bypass | FAIL | FAIL | Unchanged (FSR-2B) |
| **17. BS equation** | **FAIL** | **PASS** | **FIXED** |
| 18. TB equality | PASS | PASS | Unchanged |
| 19. P&L vs fixture | PASS | PASS | Unchanged |
| 20. Money repr | FAIL | FAIL | Unchanged (FSR-2A.5) |
| 21. Rounding | PASS | PASS | Unchanged |
| 22. Year-end close | FAIL | FAIL | Unchanged (FSR-2A.3) |
| 23. Voucher/day reconcile | PASS | PASS | Unchanged |
| 24. Coverage | PASS | PASS | Unchanged |
| 25. Empty voucher | PASS | PASS | Unchanged (FSR-2A.1) |

**Summary: 17→20 PASS, 8→5 FAIL**

## FSR-2A.1 Verifier Regression

22/22 checks PASS (FSR-2A.1 controls remain intact; no weakening).

## FSR-2A.2 Verifier

25/25 checks PASS in isolated temporary-database verifier (`scripts/verify-fsr-2a2.js`).

## Certification Status

```
Signed-Balance Contract (contra assets/equity): PASS
As-On-Date Current Profit:                       PASS
BS Equation Balance:                             PASS
FY-Start/FY-End Profit Match:                    PASS
Profit/Loss/Zero Profit Scenarios:               PASS
date_to Before FY Resolution:                    PASS
Full Legacy Regression:                          PASS
Renderer Build:                                  PASS
```

**FSR-2A.2 CERTIFIED — READY FOR FINANCIAL-YEAR CONTINUITY CORRECTIONS**
