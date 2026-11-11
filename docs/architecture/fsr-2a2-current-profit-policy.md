# FSR-2A.2 Current-Year Profit Policy

## Problem

`balanceSheetReport` received a `date_from` / `date_to` range, but the Balance Sheet is an as-on-date statement: it shows the financial position at `date_to`, not cumulatively from `date_from`. The current-year profit (or loss) line in the equity section must include profit from the start of the financial year containing `date_to` up to `date_to`, regardless of the caller's `date_from`.

## Policy

**For the Balance Sheet's current-profit computation only:**

```
profit_start_date = financialYearForDate(db, companyId, dateTo).start_date
profit_end_date   = dateTo
```

The P&L report (`profitLossReport`) remains period-based: it shows income and expenses for the full caller-specified range `date_from → date_to`. The Balance Sheet as-on-date profit is the result of `profitLossReport` called with `(db, companyId, profit_start_date, profit_end_date)`.

## Rationale

1. **As-on-date semantics:** A Balance Sheet dated 31-Dec-2025 shows the position on that date. The current-year profit is the profit earned from the beginning of FY 2025-26 (say 01-Apr-2025) to 31-Dec-2025. Using `date_from` (which might be 01-Jun-2025) would omit April–May profit.
2. **Consistency with P&L:** If the user selects a P&L range of Jun–Dec, the P&L correctly shows Jun–Dec profit. The Balance Sheet still shows FY-to-date profit. The two reports serve different purposes.
3. **Zero-profit edge cases:** When `date_to` falls before any FY exists, the `financialYearForDate` call returns null, and the current-profit line is set to 0 (no profit period resolved).

## Verifier Coverage (checks 11, 15–16)

| Check | Scenario | Expected |
|---|---|---|
| 11a | Same date_to, different date_from | Both 9,000 |
| 11b | P&L with Jun–Dec range | P&L 9,000 for Apr–Dec, 0 for Jun–Dec |
| 15 | FY-start BS profit vs P&L | Both 0 |
| 16 | FY-end BS profit vs P&L | Both 9,000 |
| 17 | date_to before any FY | Current profit = 0 |

All PASS.

## Limitation

If a company has no FY defined for `dateTo`, current profit is 0. The caller must ensure a financial year exists for the as-on-date.
