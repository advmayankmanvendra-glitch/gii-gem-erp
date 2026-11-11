# FSR-2A.3 Multi-Year Continuity Model

## Principle

A closed financial year's equity, assets, and liabilities must carry forward into the next year so that the next year's opening reports reflect the previous year's closing position. This requires three elements to work together correctly:

1. **Close** — consume source FY's BS, decompose signed amounts, store as carry-forward entries
2. **Consume** — destination FY's reports read carry-forward entries as opening balances
3. **Profit transfer** — the source FY's net profit increases (or loss decreases) the Capital account in the destination FY

## Y1→Y2→Y3 Continuity (FSR-2A.3 checks 31a-31g)

The multi-year fixture simulates three consecutive years:

### Y1 (2025-04-01 to 2026-03-31)
- Initial capital: Bank 50,000 / Capital 50,000
- Profit: Bank 10,000 / Income 10,000
- Close Y1 → Y2: Bank opening_debit=60,000; Capital opening_credit=50,000; Profit transfer opening_credit=10,000

### Y2 (2026-04-01 to 2027-03-31)
- Opening position from carry-forward: Bank 60,000, Capital 60,000 (50k + 10k profit)
- Additional profit: Bank 5,000 / Income 5,000 → Bank=65,000
- Expense: Expense 2,000 / Bank 2,000 → Expense=2,000, Bank=63,000
- Y2 net profit: 5,000 (income) - 2,000 (expense) = 3,000
- Close Y2 → Y3: Bank opening_debit=63,000; Capital opening_credit=63,000 (60k + 3k profit)

### Y3 (2027-04-01 to 2028-03-31)
- Opening position: Bank 63,000, Capital 63,000
- Trial Balance: Dr=Cr=63,000
- Balance Sheet: assets=63,000, liabilitiesAndEquity=63,000
- P&L: netProfit=0 (no Y3 transactions yet)
- Capital includes Y1+Y2 retained profits: Capital credit = 63,000

## Continuity Properties

| Property | Expected | Verified |
|---|---|---|
| Y3 opening TB balanced | Dr=63,000, Cr=63,000 | Check 31a PASS |
| Y3 opening BS balanced | diff=0 | Check 31b PASS |
| Y3 Bank opening = Y2 closing | Bank=63,000 | Check 31c PASS |
| Y3 opening P&L zero | netProfit=0 | Check 31d PASS |
| Y3 Capital includes retained | Capital=63,000 | Check 31e PASS |
| Y3 Equity = Y2 Bank closing | equity=63,000 | Check 31f PASS |
| Multi-close audit trail | audit >= 2 | Check 31g PASS |

## Zero-Profit Year (FSR-2A.3 check 18)

When a financial year has zero net profit, no additional carry-forward entry is created for the Capital account. The existing BS account carry-forwards are sufficient. Check 18 confirms that a zero-profit close does not create an extra profit transfer.

## Repeated Close Prevention

Once a source FY is Locked, `closeFinancialYear` rejects any further attempt with `"Source financial year status is 'Locked', must be 'Open'"`. Check 22 verifies that the number of carry-forward entries does not increase.
