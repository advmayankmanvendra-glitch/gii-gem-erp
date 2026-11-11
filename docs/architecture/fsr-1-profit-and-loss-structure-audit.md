# FSR-1 Profit and Loss Structure Audit

**Audit date:** 2026-07-20  
**Current structure:** Simple Income minus Expense  
**Overall result:** FAIL

## Current ERP behavior

`reportBuilders.js::profitLossReport` selects accounts with `account_type IN ('Income','Expense')`, sums selected-period ledger debits and credits, and calculates:

```text
Income amount  = credit - debit
Expense amount = debit - credit
Net profit     = total income - total expenses
```

This arithmetic is deterministic. It is not a Trading Account, management statement, Schedule III statement, or Tally-style hierarchical P&L. `financialStatementSummary` separately derives Sales and Purchase by exact account names, which is a second, narrower interpretation and does not govern Sales Returns, COGS or direct costs.

## Fixture result

| Measure | Independent expected | ERP output | Result |
|---|---:|---:|---|
| Income | 28,200.00 | 28,200.00 | PASS |
| Expenses | 4,820.00 | 4,820.00 | PASS |
| Net profit | 23,380.00 | 23,380.00 | PASS |

The fixture confirms the formula over explicitly classified accounts. It does not certify the account classifications themselves.

## Commercial structure comparison

| Commercial line | Current support | Finding |
|---|---|---|
| Gross sales | Exact `Sales` ledger only in summary | Partial |
| Sales returns/discounts | Possible separate income/expense ledgers | No governed net-sales mapping |
| Opening stock | Inventory subledger only | Not in P&L engine |
| Purchases/returns | `Purchase` expense and any credit balances | Present but conflicts with perpetual COGS |
| Direct expenses | Generic Expense | No direct/indirect marker |
| Closing stock | Not explicitly adjusted in P&L | Relies on COGS path, which is incomplete |
| Gross profit | `Sales - Purchase` in summary | Incorrect for COGS/returns/direct cost model |
| Operating expenses | All Expense together | No operating/non-operating split |
| EBITDA | None | Not implemented |
| Depreciation | Manual expense ledger possible | No depreciation engine/mapping |
| Finance cost | Manual expense ledger possible | No governed section |
| Profit before tax | Same as net profit unless tax expense ledger used | No stage calculation |
| Tax expense/PAT | Generic Expense possible | No governed tax stage |

## Verification findings

1. Period activity, rather than lifetime nominal balances, is used: PASS.
2. Direct and indirect expenses remain distinct: FAIL; both are generic Expense.
3. Sales/purchase returns reduce their base lines through governed mapping: FAIL; only broad account type behavior exists.
4. Closing stock is recognized exactly once across stock/GL: FAIL; stock inward and adjustments do not reach Inventory GL.
5. GST is excluded from income/expense when default GST accounts are used: PASS for current automated sales/purchase patterns.
6. Depreciation and accumulated depreciation reconcile: FAIL at Balance Sheet presentation.
7. Finance cost classification: FAIL.
8. Profit agrees with dynamic Balance Sheet current profit for the same selected range: PASS.
9. Profit transfers/carries to next year: FAIL.
10. Prior-year comparative figures: FAIL; no comparative backend contract.
11. Drill-down to voucher: PASS at ledger level.
12. Draft/Cancelled exclusion: FAIL; synthetic unposted effects increased P&L income by 333.00.

## Inventory cost risk

The standard purchase poster debits `Purchase`, stock inward increases `stock_ledger` without debiting Inventory, and stock outward later debits COGS/credits Inventory. The resulting P&L can include both Purchase and COGS for the same goods while the Balance Sheet Inventory ledger was never funded by inward posting. This is a CRITICAL accounting-model defect, not a layout issue.

## Statutory readiness

A company-format Statement of Profit and Loss needs a separately governed mapping profile, comparative figures, material line-item sections, notes and entity-framework applicability. The current flat report does not provide these controls. Companies Act section 129 requires company financial statements to comply with notified accounting standards and Schedule III form: <https://www.indiacode.nic.in/show-data?actid=AC_CEN_22_29_00008_201318_1517807327856&orderno=132&sectionId=49276&sectionno=129>.

## Decision

**Arithmetic over current account types:** PASS  
**Commercial P&L structure:** FAIL  
**Statutory statement structure:** FAIL  
**Remediation priority:** CRITICAL/HIGH through FSR-2A, FSR-2B and FSR-2C

