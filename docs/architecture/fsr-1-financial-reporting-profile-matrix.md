# FSR-1 Financial Reporting Profile Matrix

**Audit date:** 2026-07-20  
**Recommendation:** Build one governed Financial Statement Engine with separate presentation/mapping profiles.

## Why profiles are required

Operational accounting, management reporting, company statutory reporting and non-corporate reporting have different classifications and disclosure objectives. They should share certified ledger facts and calculation primitives, but they must not be combined through account-name tests or scattered UI conditions.

## Profile matrix

| Profile | Primary purpose | Core structure | Period behavior | Current readiness |
|---|---|---|---|---|
| A. Operational Accounting | Daily accountant verification | Trading/P&L, balance sheet, immediate drill-down | User-selected period/as-on date | Partial flat reports; FAIL hierarchy |
| B. Management | Decision support | Revenue, COGS, margin, operating costs, EBITDA policy, PBT/PAT, ratios | Current/comparative/budget | Not implemented |
| C. Statutory Company | Companies Act reporting | Applicable Schedule III division, notes, current/non-current, comparatives | Reporting year and prior period | Not implemented |
| D. Non-Corporate | Proprietorship/partnership/other formats | ICAI non-corporate presentation and entity-specific equity | Reporting period/comparatives | Not implemented |

## Shared engine contract

The common engine should own:

- company, financial year and as-on/period semantics;
- approved-posting selection;
- opening, movement and closing balances;
- signed/contra balance handling;
- account-group rollup;
- P&L current-result linkage to equity;
- stock/GL reconciliation input;
- comparative-period normalization;
- stable drill-down evidence IDs;
- governed rounding and money precision.

## Profile adapters

| Adapter | Mapping responsibilities | Must not do |
|---|---|---|
| Operational | Trading/direct/indirect groups and accountant-friendly hierarchy | Change accounting totals |
| Management | KPI regrouping, margin layers, ratios and budgets | Reclassify statutory books silently |
| Corporate statutory | Schedule division, notes, current/non-current, comparative labels | Infer legal applicability from company name |
| Non-corporate | Capital/drawings/partner or proprietor presentation | Reuse corporate share-capital assumptions |

## Required registries

1. Legal-entity and reporting-framework profile.
2. Account-group hierarchy with stable IDs.
3. Operational/management/statutory mappings by version and effective date.
4. Contra-account and negative-balance rules.
5. Current/non-current and cash-flow classifications.
6. Disclosure/note mappings and applicability flags.

## Sequencing

```text
FSR-2A Accounting Truth Corrections
  -> FSR-2B Chart of Accounts and Mapping Registry
  -> FSR-2C Financial Statement Engine
  -> FSR-2D Operational Presentation
  -> FSR-2E Statutory Profiles
  -> FSR-2F Cash Flow and Advanced Reports
```

No presentation profile should be certified until the shared engine passes the FSR-1 fixture class, company isolation, status exclusion, inventory reconciliation and financial-year continuity gates.

