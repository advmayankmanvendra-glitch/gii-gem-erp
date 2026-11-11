# GII GeM ERP — Month-End Financial Checklist

> Mandatory month-end closing procedures. Each step must be completed in sequence. Do not skip.
> Version: 1.0 | Last Updated: July 2026

---

## Sequence Overview

```
Step  1 — Complete All Pending Transactions
Step  2 — Reconcile Bank Statements
Step  3 — Verify GST Register (Output vs Input)
Step  4 — Run Trial Balance (Dr = Cr)
Step  5 — Review P&L Statement
Step  6 — Verify Balance Sheet
Step  7 — Run GST Sales/Purchase Register
Step  8 — Prepare GSTR-3B Data
Step  9 — Verify TDS Register
Step 10 — Review Receivable/Payable Ageing
Step 11 — Run Profitability Analysis
Step 12 — Backup Database
Step 13 — Generate Month-End Reports Package
```

---

## Step 1: Complete All Pending Transactions

**Procedure:**
1. Navigate to **Operations > Billing** → filter by status "Draft", "Pending Approval", "Approved — Unposted"
2. Navigate to **Operations > Procurement** → same filter for draft/pending procurements
3. Navigate to **Operations > Collections** → post all draft receipts
4. Navigate to **Accounting > Voucher Register** → post any remaining draft vouchers
5. Navigate to **Inventory > Stock Inward / Stock Outward** → post pending stock transactions

**Verification:**
- Run **Accounting > Posting Control** — zero entries showing errors
- Run **Dashboard > Operations Mode > Unposted Drilldown** — zero unposted records

**Warning if skipped:** Posting transactions after month-end distorts Trial Balance and GST returns. Corrections in a closed period require reversal entries and audit trail.

---

## Step 2: Reconcile Bank Statements

**Procedure:**
1. Navigate to **Accounting > Bank Reconciliation**
2. Import or manually enter bank statement for the month
3. Match each bank entry with ERP cash/bank ledger entries
4. Flag unmatched entries for investigation
5. Post adjusting entries for bank charges, interest, or direct debits found on statement
6. Mark reconciled entries as cleared
7. Verify closing balance matches bank statement

**Verification:**
- Bank book balance = Statement closing balance (tolerate only timing differences under ₹500)
- All reconciling items older than 60 days escalated

**Warning if skipped:** Unreconciled bank accounts hide cash misstatements. Bank reconciliation is a statutory audit requirement under Indian accounting standards.

---

## Step 3: Verify GST Register (Output vs Input)

**Procedure:**
1. Navigate to **GST & Tax > GST Register**
2. Set period = current month
3. Export Output GST summary: Sales invoices posted in the month
4. Export Input GST summary: Purchase procurements posted in the month
5. Compare:
   - Output GST = Sum of invoice-level GST (CGST + SGST/IGST)
   - Input GST = Sum of procurement-level GST (CGST + SGST/IGST)
6. Verify intra-state vs inter-state classification (CGST/SGST vs IGST)

**Verification:**
- Output GST matches total from Step 7 (GST Sales Register)
- Input GST matches total from Step 7 (GST Purchase Register)
- No GST entry without corresponding ledger entry

**Warning if skipped:** GST register mismatches cause incorrect GSTR-3B filing, leading to notice from tax authorities and interest/penalty under Section 73/74 of CGST Act.

---

## Step 4: Run Trial Balance (Dr = Cr)

**Procedure:**
1. Navigate to **Financial Control > Trial Balance**
2. Set period = current month
3. Verify: Total Debits = Total Credits
4. Review each account balance for reasonableness (e.g., bank balances should not be negative, sales should not be zero if orders were billed)
5. Investigate any suspense account balances — should be zero

**Verification:**
- Dr = Cr to the nearest paisa
- No account with abnormal balance (e.g., credit sales balance, debit liability balance)
- Suspense account: 0.00

**Warning if skipped:** An unbalanced Trial Balance means the accounting engine has a systematic error. Proceeding to P&L and Balance Sheet produces meaningless statements. Lock the period and investigate before proceeding.

---

## Step 5: Review P&L Statement

**Procedure:**
1. Navigate to **Financial Control > Profit & Loss**
2. Set period = current month
3. Review:
   - Total Sales (Income) — should match invoice total for the month
   - Total Purchases (Expense) — should match procurement total
   - Expenses — should reflect all posted expense entries
   - Net Profit / Net Loss — should be consistent with operational activity
4. Compare with previous month — investigate material variances (>20%)

**Verification:**
- Sales = Sum of invoice billing values (less credit notes)
- Purchases = Sum of procurement purchase values (less debit notes)
- Net margin % is within expected range for the business

**Warning if skipped:** Misstated P&L hides cash flow problems and misleads management. Tax provisions may be calculated incorrectly.

---

## Step 6: Verify Balance Sheet

**Procedure:**
1. Navigate to **Financial Control > Balance Sheet**
2. Set period = current month-end
3. Verify accounting equation: Total Assets = Total Liabilities + Equity
4. Review:
   - Trade Receivables — should match outstanding receivable ageing total
   - Trade Payables — should match outstanding payable ageing total
   - Bank/Cash balances — should match Step 2 reconciliation closing balance
   - Capital/Reserves — should reflect retained earnings
5. Check Current Ratio = Current Assets / Current Liabilities (benchmark > 1.5)

**Verification:**
- Balance Sheet balances (Assets = Liabilities + Equity)
- Receivables match Step 10 ageing
- Payables match Step 10 ageing
- Bank balance matches Step 2

**Warning if skipped:** An incorrect Balance Sheet invalidates the entire month-end process and all external reporting. GST and statutory filings based on incorrect Balance Sheet may be rejected.

---

## Step 7: Run GST Sales/Purchase Register

**Procedure:**
1. Navigate to **GST & Tax > GST Register**
2. Select "Sales Register" (invoice-wise output GST summary)
3. Export the register — verify with Sales summary from Step 5
4. Select "Purchase Register" (procurement-wise input GST summary)
5. Export the register — verify with Purchase summary from Step 5
6. Check HSN/SAC code-wise summary for returns filing

**Verification:**
- Sales Register total = Billing total for the month (excluding credit notes)
- Purchase Register total = Procurement total for the month (excluding debit notes)
- HSN summary totals match invoice line-item HSN totals

**Warning if skipped:** GSTR-1 and GSTR-3B require HSN/SAC-wise summary. Monthly filing deadlines cannot be met without this data. Late filing penalty under Section 47: ₹50/day (₹25 CGST + ₹25 SGST).

---

## Step 8: Prepare GSTR-3B Data

**Procedure:**
1. Using Step 3 and Step 7 data, prepare:
   - 3.1(a) — Taxable outward supplies (from Sales Register)
   - 3.1(b) — Outward supplies attracting reverse charge
   - 4(A) — Input GST (from Purchase Register, eligible ITC)
   - 4(D) — ITC reversed if applicable
   - 5(A) — ITC claimed
2. Calculate net GST payable = Output GST − Input GST (eligible)
3. Verify TDS/TCS entries if applicable
4. Cross-reference with TDS Register (Step 9)

**Verification:**
- GSTR-3B Table 3.1(a) = Step 7 Sales Register taxable value
- GSTR-3B Table 4(A) = Step 7 Purchase Register eligible ITC
- Net GST payable matches output minus input from Step 3

**Warning if skipped:** GSTR-3B filing is mandatory by 20th of following month. Non-filing blocks e-way bill generation and disables GST registration. Interest at 18% p.a. applies on delayed payment.

---

## Step 9: Verify TDS Register

**Procedure:**
1. Navigate to **GST & Tax > TDS Register**
2. Set period = current month
3. Verify:
   - TDS deducted by department on invoice payments
   - GST TDS (if applicable under Section 52 of CGST Act)
   - TDS on supplier payments
4. Match TDS Register totals with:
   - Receivable allocations (TDS deducted column)
   - Supplier payment allocations (TDS column)
5. Export TDS certificate data for department/supplier issuance

**Verification:**
- TDS Register total = Sum of TDS deducted across all receipt allocations
- GST TDS Register total = Sum of GST TDS across all receipt allocations
- TDS deposited to government matches TDS deducted (less any corrections)

**Warning if skipped:** TDS deduction without deposit attracts interest under Section 201(1A). Non-filing of TDS return (Form 26Q/27Q) attracts penalty under Section 271H: ₹10,000 to ₹1,00,000.

---

## Step 10: Review Receivable/Payable Ageing

**Procedure:**
1. Navigate to **Receivables & Payables > Receivable Ageing**
2. Set period = month-end date
3. Review ageing buckets: 0–30, 31–60, 61–90, >90 days
4. Identify amounts in >90 days bucket — should be less than 5% of total receivables
5. Navigate to **Payable Ageing** — review same buckets
6. Cross-reference with Balance Sheet (Step 6)

**Verification:**
- Receivable ageing total = Trade Receivables on Balance Sheet
- Payable ageing total = Trade Payables on Balance Sheet
- >90 days bucket requires written justification

**Warning if skipped:** Ageing reports are critical for audit (Ind AS 109 expected credit loss). Stale receivables may become uncollectible; stale payables may attract supplier disputes.

---

## Step 11: Run Profitability Analysis

**Procedure:**
1. Navigate to **Profitability > Order Profitability**
2. Set period = current month
3. Run report for all closed orders in the period
4. Verify:
   - Gross Margin % for each order
   - Net Margin % after expenses and incentives
   - Order-level ROI
5. Navigate to **Profitability > Profit Simulator** to run scenarios if planning for next month
6. Export profitability report for management review

**Verification:**
- Net profit across all orders matches P&L net profit (Step 5)
- No order with negative net margin without documented reason
- Employee incentives correctly computed

**Warning if skipped:** Profitability drives management decisions. Inaccurate profitability leads to incorrect pricing in future bids and misallocation of resources.

---

## Step 12: Backup Database

**Procedure:**
1. Navigate to **Utilities > Backup**
2. Click **Create Backup**
3. Verify backup file is created with correct name format: `gii_gem_erp_<YYYY-MM-DD>_<timestamp>.db`
4. Note backup size and location in the month-end log
5. Copy backup to an external/network drive (off-site storage)
6. If possible, verify backup integrity by running `npm run verify:accounting` against the backup copy

**Verification:**
- Backup file exists and size > 1 MB
- Backup file name includes date
- External copy matches local copy (checksum)

**Warning if skipped:** No backup = permanent data loss risk. An ERP without a verified month-end backup cannot be audited. All month-end adjustments not yet backed up are vulnerable to corruption.

---

## Step 13: Generate Month-End Reports Package

**Procedure:**
1. Export all of the following as PDF/XLSX:
   - Trial Balance (Step 4)
   - P&L Statement (Step 5)
   - Balance Sheet (Step 6)
   - GST Sales Register (Step 7)
   - GST Purchase Register (Step 7)
   - GSTR-3B data sheet (Step 8)
   - TDS Register (Step 9)
   - Receivable Ageing (Step 10)
   - Payable Ageing (Step 10)
   - Profitability Report (Step 11)
   - Bank Reconciliation Statement (Step 2)
   - Day Book for the month
2. Save to `reports/month-end/YYYY-MM/` folder
3. Email or share with:
   - Management (P&L, Balance Sheet, Profitability)
   - Accountant (GST, TDS, Bank Reconciliation)
   - External Auditor (all reports, on request)

**Verification:**
- All 11+ report files present
- File names follow convention: `YYYY-MM_<ReportName>.pdf`
- Reports package saved in designated folder

**Warning if skipped:** Month-end package is the permanent record of the financial close. Without it, audit trail is incomplete and management reporting is delayed.

---

## Month-End Sign-Off Sheet

| Step | Action | Completed? | Date | Verified By |
|---|---|---|---|---|
| 1 | Pending Transactions Complete | ☐ | __/__/____ | ____________ |
| 2 | Bank Reconciliation Done | ☐ | __/__/____ | ____________ |
| 3 | GST Register Verified | ☐ | __/__/____ | ____________ |
| 4 | Trial Balance (Dr = Cr) | ☐ | __/__/____ | ____________ |
| 5 | P&L Reviewed | ☐ | __/__/____ | ____________ |
| 6 | Balance Sheet Verified | ☐ | __/__/____ | ____________ |
| 7 | GST Sales/Purchase Register | ☐ | __/__/____ | ____________ |
| 8 | GSTR-3B Data Prepared | ☐ | __/__/____ | ____________ |
| 9 | TDS Register Verified | ☐ | __/__/____ | ____________ |
| 10 | Ageing Reviewed | ☐ | __/__/____ | ____________ |
| 11 | Profitability Run | ☐ | __/__/____ | ____________ |
| 12 | Backup Created | ☐ | __/__/____ | ____________ |
| 13 | Reports Package Generated | ☐ | __/__/____ | ____________ |

**Accountant Signature:** ______________________ **Date:** ____________

**Management Review:** ☐ Approved  ☐ Needs Correction  **Date:** ____________

---

## Month-End Deadline Calendar

| Deadline | Activity | Responsible |
|---|---|---|
| Month-end + 1 day | Complete all pending transactions | Operations Manager |
| Month-end + 3 days | Bank reconciliation, GST register, Trial Balance | Accountant |
| Month-end + 5 days | P&L, Balance Sheet, Ageing review | Accountant + Manager |
| Month-end + 7 days | Profitability, TDS, Reports package | Accountant |
| Month-end + 10 days | GSTR-3B filing | Accountant |
| Month-end + 15 days | TDS return filing | Accountant |

---

*End of Month-End Financial Checklist*
