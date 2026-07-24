# FSR-2A.5C Party & Control-Account Reconciliation

## Tests

- C26: Receivables = Trade Receivables GL — GL=40,000 expected=40,000
- C27: Payables = Trade Payables GL — GL=532,000 expected=532,000

## Trade Receivables

Trade Receivables is a debit-normal Asset account. The net movement is computed as `debit_minor - credit_minor` across all posted, non-deleted vouchers.

| Transaction | Debit | Credit | Net |
|-------------|-------|--------|-----|
| Sale (INV-001) | 737,500 | 0 | +737,500 |
| Receipt (UTR-001) | 0 | 500,000 | -500,000 |
| Discount Allowed | 0 | 50,000 | -50,000 |
| Credit Note | 0 | 147,500 | -147,500 |
| **Total** | **737,500** | **697,500** | **40,000** |

Expected: Sale 7,375 − Receipt 5,000 − Discount 500 − Credit Note 1,475 = 400 (₹400 in major units) = 40,000 paise ✓

## Trade Payables

Trade Payables is a credit-normal Liability account. The net movement is computed as `-(debit_minor - credit_minor)` = `credit_minor - debit_minor`.

| Transaction | Debit | Credit | Net (credit - debit) |
|-------------|-------|--------|---------------------|
| Supplier invoice (PI-001) | 0 | 1,180,000 | +1,180,000 |
| Payment (UTR-SP-001) | 500,000 | 0 | -500,000 |
| Discount Received | 30,000 | 0 | -30,000 |
| Debit Note | 118,000 | 0 | -118,000 |
| **Total** | **648,000** | **1,180,000** | **532,000** |

Expected: 11,800 − 5,000 − 300 − 1,180 = 5,320 (₹5,320 in major units) = 532,000 paise ✓

## Sign Convention

The sign convention for credit-normal control accounts is critical. Raw `debit_minor - credit_minor` gives the change in the account's debit balance. For credit-normal accounts, the net balance change is `credit_minor - debit_minor` = `-(debit_minor - credit_minor)`. Both C26 and C27 apply this correctly.
