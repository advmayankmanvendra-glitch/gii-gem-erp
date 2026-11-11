# FSR-1 Chart of Accounts Classification Matrix

**Audit date:** 2026-07-20  
**Overall result:** FAIL

## Implemented schema

`accounts` provides `account_code`, `account_name`, one of five `account_type` values, optional `parent_account_id`, `normal_balance`, `opening_balance`, company scope and soft-delete fields.

It does **not** provide a governed group ID/code, report section, current/non-current class, trading/P&L class, cash-flow class, statutory mapping, posting-to-group policy, system protection, or rename/delete governance by group.

## Default ledger matrix

| Code | Ledger | Type | Normal | Current report treatment | Finding |
|---|---|---|---|---|---|
| 1000 | Cash | Asset | Debit | Balance Sheet asset | Usable, no cash-flow mapping |
| 1010 | Bank | Asset | Debit | Balance Sheet asset | Usable, no overdraft reclassification |
| 1100 | Trade Receivables | Asset | Debit | Balance Sheet asset | No current/non-current split |
| 1200 | TDS Receivable | Asset | Debit | Balance Sheet asset | No statutory-note mapping |
| 1210 | GST TDS Receivable | Asset | Debit | Balance Sheet asset | No statutory-note mapping |
| 1300 | Input GST | Asset | Debit | Balance Sheet asset | No net/gross tax presentation policy |
| 1400 | Inventory | Asset | Debit | Balance Sheet asset | Not reconciled to stock subledger |
| 2000 | Trade Payables | Liability | Credit | Balance Sheet liability | No ageing/current mapping in statement |
| 2100 | GST Payable | Liability | Credit | Balance Sheet liability | Separate from Output GST; policy absent |
| 2110 | Output GST | Liability | Credit | Balance Sheet liability | No net/gross tax presentation policy |
| 2200 | Expense Payable | Liability | Credit | Balance Sheet liability | No accrual/provision distinction |
| 2300 | Employee Incentive Payable | Liability | Credit | Balance Sheet liability | Current classification inferred only |
| 3000 | Capital | Equity | Credit | Balance Sheet equity | Entity-type neutral; no share/partner mapping |
| 3010 | Opening Balance Suspense | Equity | Credit | Balance Sheet equity | Suspense can be hidden in equity total |
| 4000 | Sales | Income | Credit | P&L income | Goods/services/returns not separated |
| 5000 | Purchase | Expense | Debit | P&L expense | Conflicts with perpetual COGS path |
| 5050 | Cost of Goods Sold | Expense | Debit | P&L expense | Direct cost not structurally marked |
| 5100-5150 | Operational expenses | Expense | Debit | P&L expense | Direct/indirect classification absent |
| 5160 | Bank Charges | Expense | Debit | P&L expense | Finance/operating policy absent |
| 5170 | Other Deduction Ledger | Expense | Debit | P&L expense | Broad catch-all; classification risk |
| 5990 | Profit and Loss | Equity | Credit | Balance Sheet equity | Not linked to working year-end transfer |

## Required classification coverage

| Required group | Current equivalent | Status | Risk |
|---|---|---|---|
| Share Capital | Capital | Partial | Entity-type ambiguity |
| Proprietor/Partner Capital | Capital | Partial | No reporting profile |
| Reserves and Surplus | None | Missing | High |
| Retained Earnings | Profit and Loss | Partial | Year-end process fails |
| Drawings | None by default | Missing | Contra-equity mishandled by report |
| Current-Year Profit/Loss | Dynamic calculation | Partial | Period bug |
| Secured/Unsecured Loans | None | Missing | High |
| Bank Overdraft | Bank only | Missing | Negative bank not reclassified |
| Trade Payables | Trade Payables | Present | Current/non-current absent |
| Duties/Taxes | GST ledgers | Partial | No governed net/gross mapping |
| Employee/Expense Payables | Two ledgers | Present | No statement section metadata |
| Provisions | None | Missing | High |
| Other/Long-term Liabilities | None | Missing | High |
| Property, Plant and Equipment | None | Missing | High |
| Intangibles/CWIP/Investments | None | Missing | High |
| Inventory | Inventory | Present | GL/subledger mismatch |
| Trade Receivables | Trade Receivables | Present | Current/non-current absent |
| Cash/Bank | Cash, Bank | Present | No cash-equivalent policy |
| Loans/Advances/Deposits/Prepaids | None | Missing | High |
| Input Tax Credits | Input GST/TDS | Partial | Statutory mapping absent |
| Sales of Goods/Services | Sales | Partial | Revenue classes mixed |
| Other Operating/Other Income | None | Missing | Medium/High |
| Interest/Discount Income | None | Missing | Medium |
| Purchases | Purchase | Present | Conflicts with COGS model |
| Direct Expenses | Expense ledgers | Heuristic only | High |
| Cost of Goods Sold | COGS | Present | Inventory bridge incomplete |
| Employee/Administrative/Selling | Expense ledgers | Partial | No governed categories |
| Finance Costs | Bank Charges only | Partial | High |
| Depreciation | None | Missing | High |
| Tax Expense | None | Missing | High |
| Prior-period/Exceptional | None | Missing | High |

## Structural contradictions

1. `parent_account_id` exists, but no report builder selects or aggregates it.
2. The UI calls the output a group structure while assigning groups from account-name substrings.
3. `Purchase` and `Cost of Goods Sold` are both P&L expenses while stock inward does not debit Inventory. The same procurement lifecycle can therefore expense purchase and later expense COGS.
4. Contra asset/equity ledgers are representable by `normal_balance`, but Balance Sheet totals add their positive normal-side amount rather than subtracting it from the section.
5. `Opening Balance Suspense` is typed Equity, allowing unresolved differences to blend into equity instead of remaining conspicuous.
6. `seedAccounts` upserts default account type and normal balance by code on initialization, which can overwrite user classification changes for those codes.

## Governance fields required before FSR-2C

Every account group/mapping should carry:

- immutable group ID and stable code;
- parent group and posting permission;
- normal balance and contra-account behavior;
- operational, management, and statutory statement sections;
- current/non-current and cash-flow classifications;
- entity/reporting-profile applicability;
- system-protection and user-edit policy;
- effective date/version and migration provenance.

**Safe to correct during FSR-1:** No  
**Required next programme:** FSR-2A accounting truth corrections, then FSR-2B mapping registry

