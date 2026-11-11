# FSR-2A.5C Carry-Forward Completeness

## Tests

- C28: Carry-forward entries created — 16 entries
- C29: Carry-forward balances balanced — debit=34,122,000 credit=34,122,000
- C30: Source-year continuous balance — dr=46,003,100 cr=46,003,100

## Carry-Forward Entry Design

All balance-sheet accounts with non-zero closing balances are carried forward:

| Account | Type | Opening Debit | Opening Credit |
|---------|------|--------------|----------------|
| INVENTORY | Asset (Dr) | 540,000 | 0 |
| CASH | Asset (Dr) | 9,799,900 | 0 |
| BANK | Asset (Dr) | 15,680,000 | 0 |
| TRADE_RECEIVABLES | Asset (Dr) | 40,000 | 0 |
| INPUT_GST | Asset (Dr) | 162,000 | 0 |
| FIXED_ASSET | Asset (Dr) | 5,000,000 | 0 |
| SUPPLIER_ADVANCE | Asset (Dr) | 200,000 | 0 |
| PREPAID_EXPENSE | Asset (Dr) | 120,000 | 0 |
| CAPITAL | Equity (Cr) | 0 | 30,000,000 |
| TRADE_PAYABLES | Liability (Cr) | 0 | 532,000 |
| OUTPUT_GST | Liability (Cr) | 0 | 90,000 |
| LOAN | Liability (Cr) | 0 | 2,500,000 |
| ADVANCE_RECEIPT | Liability (Cr) | 0 | 300,000 |
| EXPENSE_ACCRUAL | Liability (Cr) | 0 | 200,000 |
| ACCUM_DEPR | Asset (Cr) | 0 | 500,000 |
| RETAINED_EARNINGS | Equity (Cr) | 2,580,100 | 0 |

Total debit = 34,122,000, total credit = 34,122,000.

## Net Loss Absorption

The current-period net loss of ₹25,801 (2,580,100 paise) is closed to Retained Earnings as an opening debit balance. This correctly reduces the credit-normal Retained Earnings equity account.

## Source-Year Balance

Source-year total debit (46,003,100) equals total credit (46,003,100), confirming continuity between the opening balance and ledger entry layers.

## Improvements Over 2A.3

FSR-2A.3 carried forward only 6 accounts. FSR-2A.5C carries forward all 16 balance-sheet accounts with non-zero closing balances, ensuring complete financial-year continuity.
