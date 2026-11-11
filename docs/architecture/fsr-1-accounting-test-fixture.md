# FSR-1 Deterministic Accounting Test Fixture

**Audit date:** 2026-07-20  
**Execution:** `npm.cmd run verify:financial-reports`  
**Storage:** Fresh temporary database under the OS temp directory; removed after execution  
**Production database impact:** None

## Fixture company

- Company: FSR-1 Isolated Fixture Company
- Financial year: FY 2025-26
- Start: 2025-04-01
- End: 2026-03-31
- Currency calculation precision in expected values: two decimals
- Accounts: 35 purpose-specific ledgers with explicit type and normal side

## Transactions

The script posts these through controlled accounting functions. Expected results are accumulated from the fixture definitions, not from ERP report output.

| Case | Voucher type | Debit | Credit | Amount/basis |
|---|---|---|---|---:|
| Opening balance | Journal via opening service | Cash | Capital | 5,000 |
| Sales | Sales | Receivables | Sales, Output GST | 35,400 gross |
| Purchase | Purchase | Inventory, Input GST | Payables | 23,600 gross |
| Receipt | Receipt | Bank | Receivables | 20,000 |
| Payment | Payment | Payables | Bank | 10,000 |
| Contra | Contra | Cash | Bank | 2,000 |
| Journal | Journal | Bank | Other Income | 250 |
| Debit note | Debit Note | Payables | Purchase Returns, Input GST | 118 |
| Credit note | Credit Note | Sales Returns, Output GST | Receivables | 118 |
| Stock inward financial impact | Journal | Inventory | Payables | 1,000 |
| Stock outward financial impact | Journal | COGS | Inventory | 700 |
| Sales return | Credit Note | Sales Returns, Output GST | Receivables | 3,540 |
| Purchase return | Debit Note | Payables | Purchase Returns, Input GST | 2,360 |
| Advance receipt | Receipt | Bank | Customer Advance | 5,000 |
| Supplier advance | Payment | Supplier Advance | Bank | 4,000 |
| Customer adjustment | Journal | Discount Allowed | Receivables | 125 |
| Supplier adjustment | Journal | Payables | Discount Received | 75 |
| Bank charges | Payment | Bank Charges | Bank | 200 |
| Interest income | Receipt | Bank | Interest Income | 400 |
| Interest expense | Payment | Interest Expense | Bank | 300 |
| Tax posting | Journal | Tax Expense | Tax Payable | 1,500 |
| Discount allowed | Journal | Discount Allowed | Receivables | 375 |
| Discount received | Journal | Payables | Discount Received | 225 |
| Round off | Journal | Round Off | Receivables | 20 |
| Capital introduction | Journal | Bank | Capital | 100,000 |
| Drawings | Payment | Drawings | Bank | 2,500 |
| Fixed-asset purchase | Purchase | Fixed Assets, Input GST | Bank | 11,800 gross |
| Depreciation | Journal | Depreciation | Accumulated Depreciation | 1,000 |
| Accrued expense | Journal | Administrative Expense | Expense Payable | 800 |
| Prepaid expense | Payment | Prepaid Expense | Bank | 1,000 |
| Provision | Journal | Provision Expense | Provision | 700 |
| Loan receipt | Receipt | Bank | Loan | 20,000 |
| Direct expense | Payment | Direct Expense | Bank | 1,200 |
| Other income | Receipt | Bank | Other Income | 350 |

## Independent expected results

| Result | Expected |
|---|---:|
| Trial Balance debit | 255,656.00 |
| Trial Balance credit | 255,656.00 |
| Income | 28,200.00 |
| Expenses | 4,820.00 |
| Net profit | 23,380.00 |
| Balance Sheet assets | 170,544.00 |
| Balance Sheet liabilities + equity | 170,544.00 |
| Bank closing balance | 113,000.00 Dr |
| Cash closing balance | 7,000.00 Dr |
| Receivables closing balance | 11,222.00 Dr |
| Payables closing balance | 11,822.00 Cr |
| Inventory closing GL balance | 20,300.00 Dr |

## ERP comparison

| Report | ERP | Result |
|---|---:|---|
| Trial Balance debit/credit | 255,656.00 / 255,656.00 | PASS |
| P&L net profit | 23,380.00 | PASS |
| Balance Sheet assets | 172,544.00 | FAIL, +2,000 |
| Balance Sheet liabilities + equity | 175,544.00 | FAIL, +5,000 |
| Balance Sheet difference | -3,000.00 | FAIL |

## Adversarial probes

| Probe | Expected | Actual | Result |
|---|---|---|---|
| Unbalanced manual voucher | Rejected | Rejected | PASS |
| Decimal 0.10 + 0.20 vs 0.30 | Rounded TB remains equal | Equal at report cents | PASS |
| Empty `createBalancedVoucher` | Rejected | Posted | FAIL |
| Draft/Cancelled ledger effects | Excluded | Income increased 333 | FAIL |
| Company B using Company A account IDs | Rejected/isolated | Company A Bank increased 777 | FAIL |
| Stock inward 1,000 | Stock and GL both +1,000 | Stock +1,000; GL +0 | FAIL |
| Year close and carry forward | Source locked, carry rows created | `Invalid financial year status`; no carry | FAIL |

## Reproducibility

The verifier creates and deletes its own temp root. It does not use `database/gii_gem_erp.db`, packaged runtime data, or the user's AppData ERP database. A non-zero exit is the expected certification outcome until the listed defects are remediated.

