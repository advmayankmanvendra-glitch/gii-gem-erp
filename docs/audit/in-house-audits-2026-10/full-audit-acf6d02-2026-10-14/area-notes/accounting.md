# Accounting area audit — gii-gem-erp @ acf6d02

Reviewer area: **accounting** (double-entry posting, money handling, GST/TDS, FY lock/close, numbering, company isolation, reports).
Code read from /tmp/claude-0/aud (read-only). Repro scripts: /tmp/claude-0/aud-work/accounting/*.mjs (shared helper `lib.mjs`; every script builds a fresh DB via `initializeDatabase(mkdtemp)` and deletes it afterwards).
None of the 12 already-known defects is re-reported. Where a finding widens one of them, that is noted.

## 1. Scope covered

**Files read in full:** src/main/services/accountingService.js, src/main/services/billingService.js, src/main/database/reportBuilders.js, src/main/database/moneyMigration.js, src/main/domain/money.js, src/main/database/crudHelpers.js, src/main/database/connection.js.
**Read in part:** init.js (posting helpers 680-1530, migrate 271-660), bankReconciliationService.js (posting/proposal path 360-745), accountMappingService.js (assignAccountGroup, createMappedLedgerAccount), accountMappingRegistry.js (groups/mappings/default codes), schemaDefinitions.js (shadow columns, approval_queue, soft-delete migration), operationsService.js (postBusinessTransaction), inventoryService.js postStockInward (GL lines only), main.js IPC wiring for accounting handlers, renderer billingHelpers.js/BillingVoucherScreen.jsx/VoucherEntryScreen.jsx (inputs only).
**Upgrade test:** the old baseline aec83eb was extracted with `git archive` into /tmp/claude-0/aud-work/accounting/base (its node_modules symlinked to the aud copy). A DB was built with the old code, then opened with the new code.

**Verification scripts.** Each was run one at a time from /tmp/claude-0/aud with `GII_GEM_ERP_DATA_ROOT=<fresh mkdtemp>` and `TMPDIR=/tmp/claude-0/aud-work/accounting/tmp`. Logs are in /tmp/claude-0/aud-work/accounting/logs/. The FSR scripts re-launch themselves under Electron unless `process.versions.electron` is set. Electron cannot start as root, so they were run with plain node using a 1-line shim: `node --import electron-shim.mjs scripts/X.js --electron-child`.

| Script | Result | Key output | Asserts correct money, or only shape/consistency? |
|---|---|---|---|
| verify-accounting.js | PASS (exit 0) | TB debit 2,877,500 = credit 2,877,500; vouchers 7; ledger 16; GST in 126,000 / out 180,000 | **Shape only.** Checks counts > 0, GST > 0 and TB Dr = Cr. Every bug below passes it. **Uses `initializeDatabase()` with no root, so without GII_GEM_ERP_DATA_ROOT it writes `<cwd>/database/gii_gem_erp.db`, the repo's own DB folder.** The env var is honoured (connection.js:8). |
| verify-financials.js | PASS | TB 2,877,500 = 2,877,500; P&L 1,000,000 − 718,000 = 282,000; BS 991,500 = 991,500; receivables 830,000 = 830,000; GST 54,000 = 54,000; TDS 0 | **Self-consistency only.** Compares report A to report B built from the same tables (for example billWisePayables vs supplierPayableReport). No expected figures. TDS checks compare 0 to 0. **Same repo-DB write as above when the env var is not set.** |
| verify-financial-report-structure.js | **FAIL (23/25)** | FAIL 9 "Group totals equal ledger totals — deferred to FSR-2B.3"; FAIL 16 "renderer assigns financial groups by account-name heuristics" | Structural/static checks. The 2 failures are known deferrals, not money errors. Uses mkdtemp. |
| verify-fsr-2a1.js | PASS 22/22 | Rejects empty, one-line, unbalanced, NaN and cross-company vouchers; "Posted voucher included — Income changed by 150 (expected 150)" | Mostly guard behaviour. One exact-delta check (150). Never tests reversal. |
| verify-fsr-2a2.js | PASS 25/25 | BS sign tests with fixed expected values (Bank 57,000; Capital 50,000; profit 9,000) | **Asserts real numbers** on a small fixture. Single FY, no reversal. |
| verify-fsr-2a3.js | PASS (38 PASS lines) | Close FY: carry-forward rows, "Destination opening TB balances Dr=65000 Cr=65000", "Y3 Capital includes retained profits 63000" | **Asserts real numbers** for close/carry-forward. Never reopens a closed year (see A18). |
| verify-fsr-2a4.js | 55/55 checks PASS; exit 1 | Exit 1 only because the script ends with `electron.app.exit()` ("Cannot read properties of undefined (reading 'exit')"), a harness artefact under plain node | Exact GL deltas for stock postings. Reverses stock vouchers (checks 40-47) but **never checks TB after a reversal** (see A1). Purchase voucher test (21-24) uses the guided path, not `postPurchaseVoucher` (see A5). |
| verify-fsr-2a5a.js | PASS 81/81 | Static 9, runtime 72 | Opening-batch/carry-forward behaviour. Mixed shape and numbers. |
| verify-fsr-2a5b.js | PASS 89/89 | Money parsing, rounding, and migration E1-E10 incl. "Backfill updates existing rows" | Unit-level. **Calls `backfillAll()` itself**, which the app never does (see A3). C2 "Half boundary exactly → 124" passes, but "1.005" → 100 (A21). |
| verify-fsr-2a5c.js | PASS 34/34 | C16 "TB exact equality", C17-C19 P&L exact, C26/C27 control-account recon | **Asserts real numbers** on its fixture. C13 "Report prefers minor over legacy (legacy=999999.99 minor=10000000)" confirms the mechanism behind A3. C31-34 run `addShadowColumns`/`backfillAll` manually. |
| verify-fsr-2b1.js | PASS 41/41 | Registry seeding, triggers, company isolation, "Authoritative ledger minor-unit totals remain unchanged" | Registry structure plus one money-total invariance check. |
| verify-fsr-2b2a.js | PASS 37/37 | Controlled account assignment | Structure and permissions. No money. |
| verify-fsr-2b2b.js | PASS 29/29 | COA / quick-create UX | Structure. No money. |

Of all these scripts, only verify-accounting.js and verify-financials.js touch the repo DB folder, and only when GII_GEM_ERP_DATA_ROOT is unset. The others use `os.tmpdir()` mkdtemp folders and remove them; a few also read source files under cwd, read-only. No `database/` folder was created in /tmp/claude-0/aud by these runs.

## 2. Findings

| ID | Sev | Status | Location | Defect | Impact |
|---|---|---|---|---|---|
| A1 | P0 | REPRODUCED | reportBuilders.js:773-775 (postedVoucherFilter), accountingService.js:378 | TB, P&L and BS keep only `status='Posted'`. Reversal marks the original `Reversed` (dropped) but the reversal journal is `Posted` (kept), so the reversal is counted once with nothing to offset it. | After any reversal, Sales/GST/receivables in the statements move the other way by the full amount. GST summary/registers and Day Book do not filter by status, so they disagree with the TB. Also hits stock reversals (inventoryService.js:399-482), which do not crash. |
| A2 | P0 | REPRODUCED | accountingService.js:350-363, 378 | `reverseVoucher` only checks that *today's* FY is open. Because of A1, reversing a voucher dated in a Locked/Closed year retroactively removes it from that year's statements. | Locked-year P&L/BS change silently after lock or close. Carry-forward no longer matches the restated year. |
| A3 | P0 | REPRODUCED | init.js:656-658, schemaDefinitions.js:30-46, reportBuilders.js:8-14, moneyMigration.js:46 (never called by app) | Migration 034 adds `*_minor` columns as `NOT NULL DEFAULT 0` and never backfills them. Reports use `COALESCE(SUM(x_minor), legacy)`, and SUM of zeros is 0, not NULL. | Every DB upgraded from the old main (aec83eb) shows all historical ledger amounts as 0 in TB, P&L, BS and Day Book. |
| A4 | P0 | REPRODUCED | schemaDefinitions.js:1444-1467, init.js:592-594, reportBuilders.js:632 | `approval_queue` (and 5 other tables) were added to the list in already-applied migration 022, so upgraded DBs never get `is_deleted`. `approvalQueueReport` hard-codes `aq.is_deleted`. | On an upgraded install, `accounting:data` throws "no such column: aq.is_deleted": the whole accounting workspace fails to load. No data loss. |
| A5 | P0 | REPRODUCED | accountingService.js:513-517 vs inventoryService.js postStockInward (Dr Inventory / Cr GRNI) | Procurement posting debits the **Purchase** expense, while the GRN for the same goods debits Inventory and credits GRNI. Nothing clears GRNI. | The same purchase cost is booked as both expense and inventory, then COGS is added on issue. P&L is understated and GRNI liability grows forever. |
| A6 | P1 | REPRODUCED | accountingService.js:472-485; billingService.js:320; importValidationService.js:333 | An invoice with `invoice_type='Credit Note'` posts Dr Trade Receivables / Cr Sales / Cr Output GST and creates a receivable, exactly like a sale. | Credit notes entered or imported through billing increase revenue, output GST and receivables instead of reducing them. |
| A7 | P1 | REPRODUCED | accountingService.js:591-614; operationsService.js:228-233; reportBuilders.js:589 | TDS / GST-TDS entered on receipt allocations only reduces the receivables sub-ledger. No voucher is posted (TDS Receivable never debited, Trade Receivables GL not credited). `postBusinessTransaction` also ignores `payments.tds_deducted/gst_tds_deducted/billing_id`. | TDS assets are missing from the BS. GL receivables exceed bill-wise receivables by every TDS amount. Financial Control shows TDS from the sub-ledger, not the books. |
| A8 | P1 | REPRODUCED | billingHelpers.js:6-8, billingService.js:10-13, accountingService.js:468-483, money.js:12 | Invoice line values are never rounded to paise. Posting rounds gross and components separately and rejects a 1-paisa difference. | About 0.23% of single-line 18% invoices (e.g. ₹1,001.25) cannot be posted: "Unbalanced voucher in minor units" and the invoice flips to Error. More frequent on multi-line invoices and at 5%. |
| A9 | P1 | REPRODUCED | init.js:1438-1470; billingService.js:169-177; accountingService.js:942-943 | Expense posting only uses `expense_amount` or a profitability figure computed from *already posted* expenses. Percentage-based and `fixed_amount` expenses can never post. Posting one expense posts every other unposted expense on the order, dated today, without approval. | Default (seeded) expenses stay Draft forever, which permanently blocks `closeFinancialYear`. Unapproved expenses get posted. Expenses land in the wrong period. |
| A10 | P1 | REPRODUCED | init.js:966-1006 (businessVoucherPayload); accountingService.js:292-348; init.js:1315 (createSupplierPayment is seed-only) | Guided Sales, Receipt and Supplier-Payment vouchers post to Trade Receivables/Payables but create no receivable, allocation or supplier_payments row. No app path creates `supplier_payments` at all. | Bill-wise receivables/payables, ageing and outstanding never reflect guided vouchers. Supplier bills can never be marked paid. Party Reconciliation shows "Mismatch". |
| A11 | P1 | REPRODUCED | accountingService.js:688-748 | `adjustAdvanceReceipt` does not check department/company. `adjustSupplierAdvance` does not check supplier/company. `createSupplierAdvance` accepts any `advance_paid` (supplier-side twin of the known advance > receipt bug). | One buyer's advance settles another buyer's invoice. Supplier 1's payment marks Supplier 2's bill "Fully Paid". None of this is in the GL. |
| A12 | P1 | REPRODUCED | bankReconciliationService.js:362-379, 569-603, 625-690 | Voucher proposal accepts a `suggested_ledger_id` of another company, unvalidated through draft and post. | Company 1 gets a ledger entry on a company-2 account. Company 1 TB is then out of balance by that amount (repro: diff 4,321). |
| A13 | P1 | REPRODUCED | accountingService.js:350-358 | `reverseVoucher` never checks `status='Posted'`. A Draft voucher (bank proposal) can be "reversed". | The reversal posts real ledger entries for a voucher that never hit the books (Bank moved by 250 out of nothing). |
| A14 | P2 | REPRODUCED | reportBuilders.js:73-89, 163-205; bankReconciliationService.js:642 | Day Book and Party Ledger / Party Reconciliation do not filter voucher status, so Draft vouchers appear. Bank-proposal voucher_lines are inserted without `*_minor`, so Day Book shows them at 0.00. | Unposted entries appear in Party Ledger and trigger reconciliation mismatches. Day Book amounts are wrong. |
| A15 | P2 | REPRODUCED | operationsService.js:224-240; accountingService.js:459-526 | `posting:post` posts invoices, procurements, receipts and expenses whatever their `approval_status` (a Draft was posted). | The maker-checker control the UI describes ("Approve the record before posting") is not enforced. |
| A16 | P2 | REPRODUCED | init.js:832-841; billingService.js:288-295 | The next invoice number is COUNT(non-deleted)+1. After soft-deleting an earlier draft, the generated number already exists. | Billing save fails "Invoice number must be unique…" until the user types a number by hand. |
| A17 | P2 | REPRODUCED | init.js:806-809; accountingService.js:152; VoucherEntryScreen.jsx:129 | The next voucher number is COUNT+1 per company and prefix, with no FY component. A user-typed number matching the pattern collides on UNIQUE(company_id, voucher_number). | Once that happens, auto-numbering for that voucher type fails on every later voucher ("UNIQUE constraint failed"). Numbers never restart per FY. |
| A18 | P2 | REPRODUCED | accountingService.js:856-879, 940-941 | A Locked (closed) year can be set back to Open with no unwind of carry_forward_entries. Re-close is then blocked by the duplicate check. | Postings made after reopening never reach the next year's opening (FY25 Bank 12,500 vs FY26 opening 10,000). |
| A19 | P2 | REPRODUCED + CODE-TRACED | billingService.js:14-16; BillingVoucherScreen.jsx:515; accountingService.js:479-483, 514-516 | For "CGST only", `Number(item.sgst \|\| gst/2)` stores SGST = half the GST, so CGST+SGST = 150%. "CGST only"/"SGST only" are offered as GST types. There are no CGST/SGST/IGST ledgers (single Output/Input GST). `place_of_supply` is free text and never drives the IGST choice. | Wrong tax split on invoice lines. GSTR-style CGST/SGST/IGST figures cannot be produced from the books. |
| A20 | P3 | CODE-TRACED | accountingService.js:546-551 | `postReceiptVoucher` credits receivables by amount+TDS+GST-TDS+other but debits only amount+TDS+GST-TDS. | Any non-zero `other_deductions` makes the voucher unbalanced. Only reachable via the `deductions` argument (seed), not from IPC. |
| A21 | P3 | REPRODUCED | money.js:12, 19 | `Math.round(v*100)` is not consistent half-up: "1.005"→100, "1181.475"→118147, but "2.675"→268. | Root cause of A8's 1-paisa splits. Amounts with more than 2 decimals round unpredictably. |
| A22 | P3 | CODE-TRACED | accountingService.js:1008; init.js:1238, 1262-1269; accountingService.js:350-352 | `accountingData`/`drilldownData` fall back silently to the first company. `voucherDetail` and `reverseVoucher` take a bare voucher id with no company check. | Breaks AGENTS rule 9 (no silent fallback). Any company's voucher can be viewed or reversed by id. |
| A23 | P3 | CODE-TRACED | reportBuilders.js:784-791, 849-855, 172 | The carry-forward subquery always returns 0, never NULL, so the fallback to `accounts.opening_balance` is dead code. Party ledger opening is hard-coded 0 and ignores carry-forward and prior periods. | Any non-zero `accounts.opening_balance` is ignored (it is 0 today). Party ledger running balances restart at each date filter. |
| A24 | P3 | CODE-TRACED / REPRODUCED | init.js:1128; accountingService.js:837-854, 942, 954 | Ledger `running_balance` is ordered by insert id, not date. Year close tolerates a ₹1 BS difference. Close is blocked by drafts in *any* year (postingControlReport is not limited to the FY). `createFinancialYear` allows duplicate/overlapping FYs (repro: a duplicate Open "FY 2025-26 (copy)" was created; the lock still held because the tie-break picked the locked row). | Cosmetic and robustness issues. |

Count: **P0 = 5, P1 = 8, P2 = 6, P3 = 5** (24 findings).

**Wider blast radius of known defects (not counted above):**
- Known "createRecord trusts Posted/Approved": `saveBillingVoucher` (IPC `billing:save`) also accepts `header.posting_status`, `approval_status` and `invoice_status` from the payload (billingService.js:321-325).
- Known "reversal crash": the crash only affects billing, payment, supplier_payment and procurement sources. Manual, guided, expense, opening and stock reversals succeed, and all of them then hit A1/A2.
- Known "advance > receipt": the supplier side has the same flaw (A11, `createSupplierAdvance` with 0 unallocated accepted 250,000).

## 3. Details and repro output

All scripts are in /tmp/claude-0/aud-work/accounting/ and are run with `node <script>` from that folder.

### A1: reversal is double-counted in the statements (r_reversal.mjs)
A manual Sales voucher (Dr Receivables 1180 / Cr Sales 1000 / Cr Output GST 180) is posted, then reversed.
```
original status: Reversed | reversal JOURNAL-00004 2026-10-14 Posted
Sales: delta after post {"dr":0,"cr":1000}  delta after reversal (expected 0/0) {"dr":1000,"cr":0}
Output GST: delta after post {"dr":0,"cr":180}  delta after reversal (expected 0/0) {"dr":180,"cr":0}
Trade Receivables: delta after post {"dr":1180,"cr":0}  delta after reversal (expected 0/0) {"dr":0,"cr":1180}
P&L Sales amount after reversal (expected 0): 999000      <- seed sales are 1,000,000
Same period: gstSummary.outputGst = 180000 | TB Output GST credit-debit = 179820 | gstRegisters.payable = 54000 | financialControl GST row = 54000
```
**Mechanism:** `postedVoucherFilter()` requires `v.status = 'Posted'`, and `reverseVoucher` sets the original to `'Reversed'` while the reversal journal is `'Posted'`. `gstSummary`/`gstRegisters` only check `is_deleted`, so they include both vouchers. They net to the original, so the GST reports disagree with the TB.

### A2: reversal rewrites a locked year (r_locked_reversal.mjs)
```
FY 2025-26 status: Locked | FY25 P&L expenses before: 5000 net: -5000
posting into locked year blocked: Cannot post to locked financial year FY 2025-26
reverseVoucher on FY25 voucher succeeded; reversal dated 2026-10-14
FY25 (LOCKED) P&L expenses after: 0 net: 0 => locked-year figures changed by 5000
```

### A3 and A4: upgrade from old main (r_upgrade_old.mjs, then r_upgrade_new.mjs on the same root)
```
OLD code: company 1 Bank TB debit 362345.67 | TB totals 2786345.67 2786345.67
NEW code: migration 034 applied: true
NEW code: ledger rows legacy debit vs minor: [{"account_name":"Bank","debit":12345.67,"debit_minor":0,...},{"account_name":"Capital",...,"credit":12345.67,"credit_minor":0}]
NEW code: Bank TB debit 0 | TB totals 0 0
NEW code: BS assets 0 L+E 0
SqliteError: no such column: aq.is_deleted        <- accountingData() on the upgraded DB
```
- **A3:** `addMoneyShadowColumns` only runs `ALTER TABLE ... DEFAULT 0`. `backfillAll` exists in moneyMigration.js but only test scripts call it (grep shows only verify-fsr-2a5b and 2a5c).
- **A4:** in aec83eb, migration 022's table list ended at `voucher_proposals`. acf6d02 appended `bank_reconciliation_matches, voucher_proposal_audit, inventory_movements, stock_reservations, allocation_audit, approval_queue` to the same already-applied migration.

### A5: purchase cost booked twice (r_purchase_grni.mjs)
```
Movement after posting purchase bill 10,000+GST and its stock inward (Dr+/Cr-):
{"Purchase":10000,"Inventory":10000,"Goods Received Not Invoiced":-10000,"Trade Payables":-11800}
```
The expected result is Inventory +10,000, Payables −11,800, GRNI net 0 and Purchase 0 (the guided purchase path does exactly this, init.js:1013, 1022). Note for the inventory reviewer: this overlaps inventory accounting, but the wrong line is in `postPurchaseVoucher`.

### A6, A8, A15, A16, A19: billing (r_billing.mjs)
```
A. post failed: Unbalanced voucher in minor units: debit 118147 paise, credit 118148 paise (legacy: 1181.475, 1181.475) | invoice now {"posting_status":"Error",...}
B. CGST-only line stored: {"gst_amount":180,"cgst":180,"sgst":90,"igst":0}
C. Credit Note voucher Credit Note lines: [{"account_name":"Trade Receivables","debit":590,"credit":0},{"account_name":"Sales","debit":0,"credit":500},{"account_name":"Output GST","debit":0,"credit":90}]
   Sales credit before/after: 1000000 1000500 | receivable row: {"invoice_amount":590,"balance_outstanding":590}
   C was posted with approval_status: Draft (posted without approval)
D. existing auto numbers [ 'GII-2026-27-INV-00004', 'GII-2026-27-INV-00005' ] -> after deleting GII-2026-27-INV-00004 next save fails: Invoice number must be unique per company and financial year
```
Frequency for A8 (r_round_search.mjs): `18% GST, qty 1, rates 0.01..1000.00: 234 of 100000 amounts make postSalesVoucher unbalanced in paise`. At 5%, the first failures are at rates 2.90, 4.30, 4.50 and so on.

### A7: TDS never reaches the GL (r_tds.mjs)
```
before: {"GL_TDS_Receivable":0,"GL_GST_TDS_Receivable":0,"GL_Trade_Receivables":830000,"billwise_outstanding":830000,"tdsRegister":0,"financialControl_TDS":0,"recon":"Matched"}
after TDS allocation: {"GL_TDS_Receivable":0,"GL_GST_TDS_Receivable":0,"GL_Trade_Receivables":830000,"billwise_outstanding":790000,"tdsRegister":20000,"financialControl_TDS":40000,"recon":"Mismatch"}
```

### A9: expenses that can never post, which then block year close (r_expense.mjs, r_drafts.mjs)
```
e1 {"fixed_amount":5000,"expense_amount":"","approval":"Draft"} e2 approval Draft
postBusinessTransaction(expense e1) returned: undefined (no voucher)
 expense 4: {"expense_amount":"","posting_status":"Draft","voucher_id":null} <- fixed_amount 5000 never posted
 expense 5: {"expense_amount":777,"posting_status":"Posted","voucher_id":8} <- posted although user posted e1 only
 e2 voucher date: 2026-10-14 (today, not an expense date)
--- seeded DB:
[{"module":"Expense","id":1,"ref":"Authorization",...,"status":"Draft"}, ... L1 Expense, Work Incentive]
post expense 1 -> undefined; status still Draft   (same for 2, 3)
closeFinancialYear -> Error: Cannot close year while Draft/Error transactions exist
```
`calculateProfitability` selects only `posting_status='Posted'` expenses (billingService.js:172-177). An unposted expense is therefore never in `dynamicExpenses`, and `postExpenseAccrualsForOrder` computes an amount of 0 and skips it.

### A10 and A11: guided vouchers and advances (r_guided.mjs, r_advances.mjs)
```
Party recon before: ledger 830000 vs bill-wise 830000 -> Matched
Guided sales posted SALES-00002 | receivables rows for it: 0
Party recon after guided sale: ledger 841800 vs bill-wise 830000 -> Mismatch
Party recon after guided receipt: ledger 836800 vs bill-wise 830000 -> Mismatch
After reversing guided sales voucher: guided_vouchers.status = Posted | voucher status = Reversed
---
Customer: advance #1 (department 1) adjusted against invoice of department 2: adjustment #1, receivable now {"department_id":2,"invoice_amount":1180,"amount_received":500,"balance_outstanding":680}
Supplier payment 1 supplier 1 amount 400000 unallocated 0
Supplier advance created for 250000 from a payment with 0 unallocated
Supplier advance of supplier 1 adjusted against supplier 2's bill: bill-wise payable {"supplier":"Supplier Two","invoice_amount":1180,"balance_due":0,"status":"Fully Paid"}
Guided supplier payment 300: payable ledger 427180 -> 426880 | bill-wise 426000 -> 426000 | Mismatch | supplier_payments rows created: 1 (seed row only)
```
`reverseVoucher` has no branch for `source_module='guided_vouchers'` (accountingService.js:379-423). A reversed guided voucher therefore stays "Posted". Any auto GRN or stock issue it created (init.js:861-948) is not reversed (CODE-TRACED).

### A12 and A14: bank voucher proposals (r_bank.mjs)
```
Draft voucher DRAFT-RECEIPT-00001 Draft | dayBook row: [{"debit":0,"credit":0,"status":"Draft"}] | voucher_lines minor: [{"debit":4321,"debit_minor":0,...},{"credit":4321,"credit_minor":0,...}]
Draft (unposted) lines in party ledger: 1 | party recon receivable: {... "ledger_balance":825679,"subledger_balance":830000,"difference":-4321,"status":"Mismatch"}
After posting with company-2 ledger: company-1 TB debit 2881821 credit 2877500 diff 4321
ledger_entries of that voucher: [{"company_id":1,"acc_company":1,"account_name":"Bank","debit":4321},{"company_id":1,"acc_company":2,"account_name":"Sales","credit":4321}]
```
The import's status was set to Approved with a direct UPDATE, standing in for `updateBankImportStatus`. Every other step went through the service functions.

### A13: reversing a draft voucher (r_reverse_draft.mjs)
```
Draft voucher DRAFT-BANKCHARGES-00001 status Draft ledger rows: 0 | Bank balance -50000
reverseVoucher(draft) produced JOURNAL-00004 Posted | Bank balance now -49750 (changed by 250 though nothing was ever posted)
```

### A17: voucher numbering (r_vnum.mjs)
```
user-typed JOURNAL-00005; next auto-numbered Journal fails: UNIQUE constraint failed: vouchers.company_id, vouchers.voucher_number
FY25 last / FY26 first contra numbers: CONTRA-00001 CONTRA-00002 (no FY component, no reset)
```
The count stays at 4 after each failure, so auto-numbering for Journal never recovers.

### A18: reopening a closed year (r_reopen.mjs; seeded draft expenses deleted first because of A9)
```
FY25 closing Bank after reopen+post: 12500 | FY26 opening Bank (carry-forward): 10000
re-close blocked: Carry forward already exists for this company/year
```

### A21: inconsistent half rounding
```
"1.005"->100  "2.675"->268  "1181.475"->118147  1.005->100  0.145->14
```

## 4. What looks solid (with evidence)
- **Voucher balance in paise and line validation.** `createBalancedVoucher` (accountingService.js:111-183) rejects fewer than 2 lines, zero, negative, NaN/Infinity, both-sided lines, deleted/inactive accounts and accounts of another company. It compares debit and credit in minor units, and voucher, lines and ledger are written in one transaction. Confirmed by verify-fsr-2a1 (22/22) and 2a5c C1/C2/C9.
- **Ledger rows written by the posting helpers carry correct minor values.** `postLedgerEntry` (init.js:1126-1140) derives minor values when none are passed. Opening balances and carry-forward rows write both legacy and minor columns (accountingService.js:827-832, 974-997).
- **Posting into a Closed/Locked year is blocked** for manual, guided and source postings via `assertOpenFinancialYear` (init.js:1203-1214). Shown in r_locked_reversal ("Cannot post to locked financial year") and verify-fsr-2a3 #23/#24.
- **Year close and carry-forward arithmetic** are correct for a straight close: destination TB/BS balance and profit is moved to Capital (verify-fsr-2a3 #19-#31g). TB and BS read carry-forward rows in minor units (reportBuilders.js:784-791, 849-855).
- **Company filtering** is present in every report query in reportBuilders.js (all filter `company_id = ?`; the TB/BS voucher filter also requires `v.company_id = a.company_id`). It holds as long as posting never mixes companies (A12 shows one path that does).
- **The account-mapping registry/service** checks company, account type and normal balance, and runs inside a transaction (accountMappingService.js:236-330; verify-fsr-2b1, 2b2a and 2b2b all pass).
- **Guided voucher maker-checker states** (Draft → Pending Review → Pending Approval → Approved → Posted) are enforced and double posting is blocked (accountingService.js:269-348).
- **The guided Credit/Debit Note** posts the correct direction (init.js:1075-1098), unlike the billing-path credit note (A6).
- **Opening-balance entry** requires an Open FY, one side only, and a date inside the FY; it posts through `createBalancedVoucher`.

## 5. Not covered
- Electron desktop UI click-through: not run (headless root container).
- `tallyImportService.js` voucher/ledger import paths: not read in depth. A grep shows it does not insert vouchers or ledger rows.
- `inventoryService.js` valuation logic beyond the GL lines of `postStockInward`. Left to the inventory reviewer except A5.
- `dashboardService`, `paymentReadinessService` and `orderClosureService` money figures. `calculateProfitability` formulas are treated as protected (AGENTS rule 4) and were not judged.
- Print/export of invoices (whether the CGST/SGST columns from A19 are printed).
- IPC permission enforcement (`guarded`/`enforcePermission`) and unguarded read handlers such as `accounting:data` and `accounting:drilldown`. Left to the security reviewer.
- Concurrency/WAL behaviour, and the bank import status workflow (`updateBankImportStatus`), which was bypassed in the A12 repro.
