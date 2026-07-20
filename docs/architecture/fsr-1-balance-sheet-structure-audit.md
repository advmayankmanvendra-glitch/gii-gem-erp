# FSR-1 Balance Sheet Structure Audit

**Audit date:** 2026-07-20  
**Current structure:** Flat vertical Asset/Liability/Equity listing  
**Overall result:** FAIL

## Current calculation

`reportBuilders.js::balanceSheetReport` sums all ledger activity through `date_to` for Asset, Liability and Equity accounts. For each account it calculates a positive normal-side `amount`, totals each broad account type, and adds `profitLossReport(companyId, dateFrom, dateTo).netProfit` to liabilities and equity.

The report is neither a governed current/non-current statement nor a traditional horizontal balance sheet. The renderer adds heuristic labels such as Current Assets, Duties & Taxes, and Capital / Equity after the backend result is returned.

## Deterministic fixture variance

| Measure | Independent expected | ERP output | Variance |
|---|---:|---:|---:|
| Assets | 170,544.00 | 172,544.00 | +2,000.00 |
| Liabilities + equity | 170,544.00 | 175,544.00 | +5,000.00 |
| Equation difference | 0.00 | -3,000.00 | -3,000.00 |

The variance is explained by two contra balances:

- Accumulated Depreciation had a 1,000.00 credit balance. The report added +1,000.00 to Assets instead of subtracting 1,000.00, overstating Assets by 2,000.00 relative to the correct signed result.
- Drawings had a 2,500.00 debit balance. The report added +2,500.00 to Equity instead of subtracting it, overstating equity by 5,000.00 relative to the correct signed result.

## Fundamental checks

| Requirement | Result | Evidence |
|---|---|---|
| Assets = Equity + Liabilities | FAIL | Fixture difference -3,000.00 |
| Current-year profit exactly once | PASS for one full selected period | Dynamic link equals P&L 23,380.00 |
| Current-year loss treatment | Not certified | No dedicated loss fixture passed through year close |
| P&L-to-equity movement | FAIL | Year-end close cannot complete |
| Closing stock agreement | FAIL | Stock inward changed stock subledger +1,000.00, GL +0.00 |
| Receivable/payable reconciliation | Existing separate reports | Not sufficient for statement classification |
| Bank/cash ledger agreement | PASS for fixture journal totals | No bank overdraft reclassification |
| Fixed asset register | FAIL | No register |
| Accumulated depreciation | FAIL | Contra-asset sign defect |
| Advances/prepaids | Generic assets only | No governed section |
| GST tax presentation | Generic asset/liability | No net/gross policy |
| Negative balances | FAIL | Normal-side transformation obscures contra meaning |
| Suspense visibility | FAIL | Opening suspense is ordinary Equity |
| Company isolation | FAIL | Cross-company account probe changed Bank by 777.00 |
| Comparative classification | FAIL | No comparative engine |

## As-on-date defect

Assets, liabilities and stored equity are calculated as on `date_to`, but current profit is calculated only from the caller's `date_from`. With `date_from = 2025-06-01` and `date_to = 2025-12-31`, the fixture Balance Sheet used current profit 0.00 although financial-year-to-date profit was 23,380.00. The same as-on position can therefore change simply by changing the range start.

The Balance Sheet must derive current-year result from the governing financial-year start (or books-beginning policy) to the as-on date, independent of a P&L comparison range.

## Missing structure

- current/non-current assets and liabilities;
- property, plant and equipment with accumulated depreciation;
- borrowings and maturity classification;
- reserves, retained earnings and drawings;
- provisions and statutory liabilities;
- note numbers and disclosures;
- comparative period with stable mappings;
- entity/profile selection;
- negative balance reclassification/disclosure rules.

## Decision

**Basic position query:** Present  
**Accounting equation certification:** FAIL  
**Operational presentation readiness:** Blocked by accounting correction  
**Statutory readiness:** FAIL  
**Remediation priority:** CRITICAL in FSR-2A

