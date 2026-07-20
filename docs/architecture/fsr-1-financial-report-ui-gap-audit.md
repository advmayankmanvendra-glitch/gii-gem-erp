# FSR-1 Financial Report UI Gap Audit

**Audit date:** 2026-07-20  
**Mode:** Observation only; no UI changes made  
**Overall result:** FAIL for operational/reporting completeness

## Current presentation

Trial Balance, Profit and Loss, and Balance Sheet render as flat responsive tables through `ReadOnlyReportFamilyScreen`. A summary panel shows totals and a text evidence path. The toolbar provides company selection, limited date presets, custom dates, CSV export and print-preview dispatch. Account rows can open ledger drill-down, then voucher/source evidence.

## Capability matrix

| Capability | Result | Current behavior |
|---|---|---|
| Horizontal view | No | Flat vertical table only |
| Vertical view | Partial | Table is vertical but not statement hierarchy |
| Detailed view | Partial | Ledger rows/drill-down |
| Condensed view | No | No collapse mode |
| Expand/collapse | No | No parent groups |
| Period change | Yes | Today/week/month/quarter/FY/custom |
| Company change | Yes | Company selector |
| Financial-year selector | No | Dates only |
| Comparative columns | No | No backend comparison |
| Monthly columns | No | No statement columns by month |
| Previous-year comparison | No | No comparison contract |
| Zero-balance filtering | No | No include/exclude control |
| Debit/credit presentation | Yes | Debit, credit and amount/balance columns |
| Working-capital view | No | Not implemented |
| Report search | No | No report-row search/filter |
| Keyboard navigation | Partial | Global navigation shortcuts, no statement hierarchy keys |
| Print | Partial | Print-preview event; statutory format not certified |
| PDF export | No dedicated statement export | Utility PDF does not establish statement contract |
| Excel export | No | CSV only |
| CSV export | Yes | Raw object keys from first row |
| Audit trail | Partial | Voucher drill-down includes voucher audit rows |
| Voucher drill-down | Yes | Ledger-to-voucher path works |

## Presentation risks

1. `classifyAccountGroup` assigns financial groups from account names and broad types in the renderer. Labels such as Current Assets or Duties & Taxes look authoritative but are not backed by a governed mapping.
2. The summary panel says “Universal accounting structure” and depicts Group in the evidence path even though backend group totals do not exist.
3. Balance Sheet totals can be mathematically wrong while the UI remains visually polished.
4. CSV export includes implementation-shaped fields and no report metadata, company heading, period, hierarchy, totals or certification marker.
5. No clear warning distinguishes operational internal reports from statutory financial statements.

## TallyPrime benchmark conclusion

Tally-style immediacy, hierarchy and drill-down are useful operational UX references. Tally naming, grouping and shortcuts are not accounting or statutory authority and should not be copied before the ERP's keyboard governance and backend mapping contracts are fixed.

## UX remediation order

1. Do not redesign current financial reports before FSR-2A accounting corrections.
2. After FSR-2C, bind UI rows to stable backend group/mapping IDs.
3. Add operational detailed/condensed and horizontal/vertical presentation in FSR-2D.
4. Add comparisons, zero-balance control, report search and governed exports.
5. Keep statutory profiles visibly distinct and versioned.

**Current UX maturity:** Internal Testing  
**Safe for ordinary operational inspection:** With accounting warnings  
**Safe to label statutory/production-ready:** No

