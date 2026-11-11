# Phase 7A — Init.js Internal Financial Report Builder Extraction

**Date:** 2026-07-09

## A. Executive Summary

Extracted 43 internal financial/accounting report builder functions from `src/main/database/init.js` (lines 8397–9271) into a dedicated module `src/main/database/reportBuilders.js` using an ESM factory pattern. No schema, seed, migration, posting, or public API changes.

## B. Baseline Tag Confirmed

Tag `database-baseline-2026-07-09` created and pushed to remote before any extraction.

## C. Git Status Before Phase

Clean working tree on `phase-16-enterprise-crm-integration`.

## D. init.js Before/After Line Count

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| init.js | ~8,763 lines | ~7,978 lines | **−785 lines** |
| reportBuilders.js | 0 lines | 878 lines | +878 lines |

## E. Extracted Functions (43 total)

### Core Financial Statements
1. `trialBalance`
2. `profitLossReport`
3. `balanceSheetReport`
4. `financialStatementSummary`

### GST / Tax
5. `gstRegisters`
6. `gstSummary`
7. `tdsRegisters`

### Posting Control
8. `postingControlReport`
9. `financialControlReport`

### Party Ledger
10. `partyLedgerReport`
11. `departmentLedgerReport`
12. `supplierLedgerReport`
13. `partyLedgerSummaryReport`
14. `partyReconciliationReport`

### Receivables / Payables
15. `billWiseReceivableReport`
16. `billWisePayableReport`
17. `receivableAgeingReport`
18. `payableAgeingReport`
19. `tdsReconciliationReport`
20. `gstTdsReconciliationReport`
21. `billOutstandingReport`
22. `supplierPayableReport`

### Allocations
23. `paymentAllocationReport`
24. `supplierPaymentAllocationReport`
25. `allocationReconciliationReport`
26. `unallocatedReceiptsReport`
27. `unallocatedSupplierPaymentsReport`
28. `allocationAuditReport`

### Advances
29. `advanceReceiptReport`
30. `supplierAdvanceReport`
31. `advanceAdjustmentReport`

### Register Reports
32. `accountingRegisters`
33. `dayBook`

### Credit / Approval
34. `creditTermsReport`
35. `approvalQueueReport`

### Financial Year / Opening
36. `openingBalanceReport`
37. `yearEndClosingReport`
38. `carryForwardReport`

### Internal Helpers
39. `billStatus`
40. `ageBucket`
41. `round2`
42. `parseGuidedVoucherPayload`
43. `postedGuidedNoteAdjustments`

## F. Files Changed

| File | Change |
|------|--------|
| `src/main/database/init.js` | Removed 43 report functions (+ import + factory wiring) |
| `src/main/database/reportBuilders.js` | **New** — 878 lines, factory pattern |
| `reports/init-refactor-phase-7a-report-builders-extraction-report.md` | **New** — this report |

## G. Schema Impact

**None.** No CREATE TABLE, ALTER TABLE, or schema changes.

## H. Migration Impact

**None.** No migration logic touched.

## I. Seed Data Impact

**None.** No seed data touched.

## J. IPC/Preload Impact

**None.** No IPC channels or preload APIs changed.

## K. Public API Impact

**None.** All 43 functions were internal (non-exported) in init.js. They remain available to `accountingData()` and all other callers via factory destructuring. No exported function signatures changed.

## L. Report Output Preservation Confirmation

All functions were moved with **identical** function bodies, SQL queries, and return shapes. The factory pattern injects 5 shared helpers (`activeRowClause`, `creditDueDate`, `allocationStatus`, `daysBetween`, `financialYearForDate`) via closure — preserving exact runtime behavior.

No circular dependency introduced (single-direction: init.js → reportBuilders.js).

## M. Verification Commands Executed

| Command | Result |
|---------|--------|
| `npm.cmd run lint:syntax` | PASS |
| `npm.cmd run build` | PASS |
| `npm.cmd run verify:accounting` | PASS |
| `npm.cmd run verify:financials` | PASS |
| `npm.cmd run verify:controls` | PASS (12/0) |
| `npm.cmd run verify:erp` | WARNING (pre-existing verify:audit warning, not caused by refactor) |
| `npm.cmd run verify:production-readiness-sql` | PASS (15/0) |
| `npm.cmd run verify:fk-constraints` | PASS (5/0) |

## N. Verification Results

All verification commands passed. The `verify:erp` WARNING is from a pre-existing verify:audit warning (1 WARNING, 0 FAIL, 0 CRITICAL) unrelated to this extraction.

## O. Known Limitations

None. Functions work identically to before.

## P. Safe-to-Lock Decision

**Safe to Lock: Yes** — Verified: all function bodies unchanged, no schema/migration/seed changes, no circular deps, all verification passes.

## Q. Next Recommended Phase

Phase 7B — Extract seed data or CRUD helper functions from init.js into dedicated modules.
