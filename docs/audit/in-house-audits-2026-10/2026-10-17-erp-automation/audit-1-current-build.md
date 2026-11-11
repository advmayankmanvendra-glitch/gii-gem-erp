# Audit 1: current build (cfc916e), 2026-10-17

Branch `claude/erp-full-automation-qbhv8k`, HEAD `cfc916e`, base `acf6d02` (6 commits, 56 files, +5,469 / −613).
Prior audit: `/mnt/project-files/audits/full-audit-acf6d02-2026-10-14/`.
Scratch repro scripts: `/tmp/claude-0/-home-claude-gii-gem-erp/4f25981b-b764-5350-b053-b95349bc2505/scratchpad/audit1/` (`r1`–`r13`, each on a fresh `initializeDatabase(mkdtemp)` database). No repo file was changed; `git status` was clean after every run.

## Verdict

1. **A big step forward.** 6 of the 9 prior P0s are fixed and A5 is partly fixed; only the upgrade defects (A3/F1, A4) are untouched. The 12 known defects (C1–C12) now pass, and the backend is tied to the signed-in session.
2. **Still not safe for real books.** Four open P1s give wrong GST, stock or bank figures in everyday use: the GST amount sent by the screen is posted as-is; a purchase bill posted before its GRN is booked twice; bank reconciliation crashes or marks new money as already booked; and percentage expenses can never post, which blocks year close.
3. **Upgrading a database from old main still shows every historical amount as zero** (A3/F1), and the accounting workspace fails to load (A4). Neither migration was added.
4. **Not yet a Tally replacement.** There are no CGST/SGST/IGST ledgers, no GSTR-1/3B, no e-invoice or e-way bill, no supplier payments or debit notes from the app, and a credit note doesn't reduce the invoice it corrects.
5. **Classification: Internal Testing** (up from Prototype). It is not Beta until the P1s below are fixed, the upgrade migrations land, and a desktop click-through of the posting flows passes.

## 1. Test and verify results (all run here, sequentially)

| Command | Result | Key output |
|---|---|---|
| `npm run test:integrity` (node tests) | **PASS 37/37** | C1–C12 including all sub-cases, money rounding, numbering, stock reversal, no-downgrade-on-repost, alerts (6) |
| `npm run test:integrity` (IPC security, electron stub) | **PASS 9/9** | unsigned window refused, viewer cannot post/reset/restore, lockout, recovery wired, actor from session, per-company reset, import parser restricted to dialog-picked files |
| `verify-accounting.js` (temp data root) | PASS, exit 0 | TB 2,877,500 = 2,877,500; 7 vouchers; 16 ledger rows; GST in 126,000 / out 180,000 |
| `verify-financials.js` | PASS, exit 0 | TB ties, net profit 282,000, assets 991,500 |
| `verify-controls.js` | PASS 12/12 | |
| `verify-voucher-workflows-inventory.js` | PASS | |
| `verify-operational-flow.js` | PASS | |
| `verify-phase10-inventory-automation.js` | PASS | |
| `npm run lint:syntax` | PASS | now 52 files checked (was 44) |
| `vite build` (output to scratch, not `dist/`) | PASS | one JS chunk of 2,365 kB (536 kB gzip); the warning is still suppressed |
| Electron desktop smoke test | **NOT RUN** | out of scope (headless; Electron not run) |

As the prior audit found, the verify scripts check shape and self-consistency, not correct amounts. Every new defect below passes all of them.

## 2. Status of prior findings

Legend: **F** = Fixed, **P** = Partly fixed, **O** = Still open. "Run" means re-checked with a repro or test here. "Code" means read in the code but not run.

### P0s

| ID | Status | Evidence |
|---|---|---|
| SEC-1 session/admin fallback | **F** (run) | main.js:280-299 `guarded` uses `sessionUser(event)`; authService fallback removed; ipc-security test 4 |
| SEC-2 / F4 unguarded reset/go-live/rollback | **F** (run) | main.js:1250-1281 `guarded("system_reset"…)`; ipc test 2 and test 8 |
| A1 reversal counted backwards | **F** (run) | reportBuilders.js:776 counts `Posted` and `Reversed`. r2: post + reverse leaves P&L income at 1,000,000 and net profit at 282,000; Sales TB dr 1,000 / cr 1,001,000 |
| A2 reversal changes a locked year | **F** (run) | accountingService.js:454-457 dates the reversal today. r2: FY25 locked, net profit −5,000 before and after |
| A3 / F1 money columns never backfilled on upgrade | **O** (code) | `backfillAll` still has no caller (grep: moneyMigration.js:46 only); no new migration after 034 |
| A4 `approval_queue.is_deleted` missing on upgrade | **O** (code) | no new migration. Fresh DBs have the column, upgraded ones don't |
| A5 purchase booked twice | **P** (run) | Fixed only when the GRN is posted first. Bill-first still double-books; see N3 |
| IO-1 voucher reversal leaves stock | **F** (run) | accountingService.js:524-527 `mirrorStockForSource`; test 35 |
| IO-2 purchase reversal leaves GRN/stock | **F** (code) | `reverseGuidedVoucherStock` accountingService.js:405-423; not run |

### Known defects C1–C12

All **F** (run): tests 7–32 pass.

### Security P1–P3

| ID | Status | Evidence |
|---|---|---|
| SEC-3 password change bypasses lockout | F (run) | ipc test 5 |
| SEC-4 recovery and admin-reset handlers not imported | F (run) | ipc test 6 |
| SEC-5 actor taken from the screen | F (run) | `withActor` main.js:254-263; `audit:context` blocks posting/approval actions main.js:1005-1013; ipc test 7 |
| SEC-6 forced password change UI-only | F (run) | main.js:748-751; ipc test 3 |
| SEC-7 read channels open | **P** (code) | A session is now required, but there is no role or company scoping: `accounting:data`, `documents:download` and `health:error-console` take any `company_id` |
| SEC-8 `imports:parse-file` reads any path | F (run) | main.js:898-903; ipc test 9 |
| SEC-9 admin resets super_admin | F (code) | authService guard added |
| SEC-10 no session expiry | P (code) | 60-minute idle timeout (desktopSessionService). Any channel call refreshes it, including background polling |
| SEC-11 no CSP or navigation handlers | O (code) | no `Content-Security-Policy`, `setWindowOpenHandler` or `will-navigate` in main.js |
| SEC-12 recovery errors allow enumeration | F (code) | one message for both cases |
| SEC-13 `isAdminUser` ignores super_admin | F (code) | uiHelpers.js |
| SEC-14 login hint shows admin/admin123 | F (code) | both LoginScreen files |

### Accounting P1–P3

| ID | Status | Evidence |
|---|---|---|
| A6 credit note posts as a sale | **P** (run) | The GL direction is now correct (accountingService.js:584-605), but the bill-wise receivable is not reduced. New finding N4 |
| A7 / IO-11 TDS never reaches the GL | **P** (run) | TDS and GST-TDS on the payment row now post (accountingService.js:686-700). Orphan TDS when no invoice is open: N5 |
| A8 1-paisa rounding failures | F (run) | `documentTotals` rounds per line (accountingService.js:570-579). r7 posts a mixed 18%/5% invoice |
| A9 % and fixed expenses never post; year close blocked | **O** (run) | r8: seeded 5%/2%/10% expenses. `postBusinessTransaction` returns without error, nothing posts, and `closeFinancialYear` → "Cannot close year while Draft/Error transactions exist". init.js:1463 `return null` is silent (breaks rule 13). Posting one expense no longer posts the others (F). Still dated today, not the expense date (init.js:1469) |
| A10 guided vouchers bypass sub-ledgers; no supplier payments | **O** (code) | `postSupplierPaymentVoucher` is reachable only from the seed (init.js:1333). operationsService aliases have no `supplier_payments` |
| A11 advance applied to another party | F (code) | accountingService.js:884-917 company, department and supplier checks; tests C3/C4 |
| A12 bank proposal posts to another company's account | **O** (code) | bankReconciliationService.js:598 `suggested_ledger_id` is unvalidated; the post path inserts lines directly (~660-700) |
| A13 draft voucher can be reversed | F (run) | r2: "Only posted vouchers can be reversed" |
| A14 drafts in Day Book / Party Ledger; bank lines show 0.00 | P (code) | status filter added (reportBuilders.js:81, 202). Bank-proposal `voucher_lines` are still written without `*_minor`, so they still show 0.00 |
| A15 posting ignores approval | P (run) | Only `Pending Approval` and `Rejected` are blocked (accountingService.js:57). A Draft credit note posted in r3 |
| A16 invoice number reused after delete | F (run) | `nextSeriesNumber` init.js:810. r8: INV-00002 after deleting 00001 |
| A17 voucher numbering | P (run) | A typed number no longer breaks the series (r7: JOURNAL-00050 → 00051). Voucher numbers still have no FY component and never restart per year |
| A18 reopened year breaks carry-forward | O (code) | no change to `updateFinancialYearStatus` or carry-forward unwind |
| A19 CGST/SGST split | P (run) | r7: "CGST only" now stores 90/90 (the sum is right). Still no CGST/SGST/IGST ledgers, and place of supply has no effect |
| A20 other deductions unbalanced | F (run) | "Other Deduction Ledger" debited; r9 posts |
| A21 inconsistent half rounding | F (run) | money.js `decimalStringToMinor`; test 33 |
| A22 silent first-company fallback; reversal by bare id | O (code) | init.js `drilldownData` / `inventoryData` still fall back; `reverseVoucher` has no company check |
| A23 dead fallback; party opening hard-coded 0 | O (code) | unchanged |
| A24 running balance, tolerance, duplicate FYs | O (code) | `Math.abs(bsDifference) > 1` is still in `closeFinancialYear` |

### Inventory / operations

| ID | Status | Evidence |
|---|---|---|
| IO-3 inward reversals subtract value | F (run) | stockBalance signs by `inward_quantity > 0` (inventoryService.js:24-25); test 35 |
| IO-4 to IO-7 reservations | O (code) | operationsService.js:31-58 still writes `Fully Available`/`Partially Reserved`; issue only decrements `Reserved`/`Partially Issued` (inventoryService.js:262-269) |
| IO-8 back-dated issues | O (code) | `insertStockLedger` checks the all-time aggregate (inventoryService.js:49-50) |
| IO-9 GRNI debited with no item | O (code) | guided purchase path unchanged |
| IO-10 supplier return with no supplier | O (code) | `isGrniClearedForCompany` unchanged (inventoryService.js:333-336) |
| IO-12 order closes with a draft payment | O (code) | orderClosureService unchanged |
| IO-13 opening stock shared across companies | P (run) | opening stock sits in one warehouse (inventoryService.js:12-16); C9 passes. Warehouses with `company_id` NULL or 0 are still shared |
| IO-14 to IO-17, IO-19 to IO-27 | O (code) | the services involved (paymentReadiness, crac, entitySearch, dashboard, operations DC lines) are unchanged |
| IO-18 reversals don't restore serials/batches/reservations | O (code) | `mirrorStockForSource` writes only stock_ledger rows (inventoryService.js:399-431) |
| IO-22 no GL voucher for opening stock | O (run) | r3: issuing 4 opening units credits Inventory 400 that was never debited |

### Data safety

| ID | Status | Evidence |
|---|---|---|
| F2 backup misses WAL | F (run) | checkpoint plus `VACUUM INTO` (backup.js); C10e |
| F3 rollback over an open DB | F (run) | `withDatabaseClosed` main.js:332-341; ipc test 8 |
| F5 reset wipes all companies | F (run) | per-company delete (operationalResetService.js:262-320). r11: no orphans. `import_batches` (no `company_id`) survive the reset |
| F6 to F15 imports | O (code) | importValidationService, importParserService and masterDataToolsService unchanged |
| F16 go-live runs reset before dependency check | P (code) | the server now checks dependencies before the reset (goLiveService). The wizard sends `confirm_text: "RESET"` as a constant (GoLiveWizard.jsx:105) |
| F17 go-live case/profile mismatch | F (code) | goLiveService.js:13, 23-24 |
| F18 go-live verification counts deleted vouchers | O (code) | unchanged |
| F19 `environment:info` reads missing counts | O (run) | r12: `dashboardCounts` has no `vouchers`/`invoices` keys |
| F20 rollback picks backup loosely | not re-checked | |
| F21 no pre-restore snapshot | P (code) | `replaceLiveDatabase` keeps `pre_restore_*.db`; pending restore still has no cancel |
| F22 to F26 | O (code) | unchanged (F24: supportBundle still selects `module_name`) |

### Architecture / verify scripts

ARCH-1 to ARCH-12: **O**. No script or renderer routing changes, apart from `scripts/audit/*`. ARCH-3 (`billing:save` trusts the screen's amounts) is now **confirmed in the GL**: r13 posts Output GST **1.00** on a 1,000 taxable line at 18% because the screen sent `gst_amount: 1` (billingService.js:13). ARCH-13: P (lint:syntax covers more files; bundle still 2.37 MB with the warning suppressed).

## 3. New findings, ranked

### N1 (P1): bank import approval crashes when a debit line matches a supplier payment (REPRODUCED)
- **What happens:** `updateBankImportStatus(…,"Approved")` throws `SqliteError: no such column: sp.order_id`. The whole statement can't be approved.
- **Why:** bankReconciliationService.js:280-281 selects `sp.order_id`, but `supplier_payments` has no `order_id` column (r6b lists the columns).
- **How it's reached:** any bank debit equal (±1) to any supplier payment's amount, through the amount-only match at line 145.
- **Origin:** the code predates this work (blame ea7273c4, 2026-07-14) and the prior audit missed it. The new "Already Booked" branch for supplier payments can never run because of it, and C12 only tests receipts.
- **Repro:** `r6_bank_amount.mjs` before its schema patch.
- **Fix:** remove `sp.order_id`. Find the procurement through `supplier_payment_allocations`, or by supplier alone. Add a C12-style test for a supplier-payment line.

### N2 (P1): "Already Booked" marks genuinely new bank money as reconciled, with no way to book it (REPRODUCED)
- **The cause:** `alreadyBookedMatch` (bankReconciliationService.js:186-201) trusts the automatic suggestion. The line is then set to `Reconciled`, and `approveVoucherProposal` refuses it (line 632), so nothing can book it. The suggestion is weak in three ways:
  - Supplier payments are matched on **amount alone**, any date, `LIMIT 1` (line 145). One payment can absorb any number of bank lines.
  - Receipts are matched on UTR alone, with no amount check.
  - A **Reversed** receipt or payment counts as booked (line 191, and line 197 for vouchers).
- **Repro:**
  - `r6_bank_amount.mjs`, with the N1 column added to the temp DB only: two new 400,000 debits on 10 and 20 September both become "Already Booked as PAYMENT-00001", and approving them throws.
  - `r5_bank.mjs`: after RECEIPT-00001 is reversed (Bank GL −400,000), its bank line is marked `Reconciled`. The money is in the bank but not in the books.
- **Fix:** treat a line as booked only when all of these hold:
  - the record is `Posted` (not `Reversed`) and in the same company;
  - the amount matches within 0.01;
  - the date is within a window;
  - no other bank line is linked to that record.

  Otherwise mark it "Needs Review", and give a reviewer a way to override "Already Booked".

### N3 (P1): a purchase bill posted before its GRN is still booked twice; price variance sticks in GRNI (REPRODUCED)
- **The split:** the GRNI split in `postPurchaseVoucher` (accountingService.js:631-646) looks only at GRNs already posted. `postStockInward` (inventoryService.js:200-209) always posts Dr Inventory / Cr GRNI, even when the linked procurement is already posted.
- **Repro (`r1_bill_before_grn.mjs`):**

  | Order of posting | Purchase | Inventory | GRNI | Payables |
  |---|---|---|---|---|
  | Bill, then GRN | +10,000 | +10,000 | −10,000 | −11,800 |
  | GRN, then bill (control) | 0 | +10,000 | 0 | −11,800 |
  | GRN 10,000, bill 9,000 | | | −1,000 left forever | |

- **Fix:** in `postStockInward`, when `procurement_id` points at a posted bill, credit Purchase (or a "stock received against billed purchase" clearing account) instead of GRNI. Post any GRN-to-bill difference to a Purchase Price Variance ledger. Add a test for both posting orders.

### N4 (P2): credit note reduces GL receivables but not the invoice's outstanding (REPRODUCED)
- **The gap:** `postSalesVoucher` skips `upsertReceivable` for credit notes (accountingService.js:613). Nothing links the credit note to the invoice it corrects.
- **Repro (`r3_misc.mjs`):** GL Trade Receivables 830,000 → 829,410, bill-wise 830,000 → 830,000. Party reconciliation now shows a mismatch, and the original invoice still looks fully due in ageing and in the daily dues alert.
- **Also:** a Draft credit note posted without approval (A15).
- **Fix:** require `against_invoice_id` on credit notes. Post an adjustment allocation that reduces that invoice's receivable, and cap it at the invoice's outstanding amount. Do the same later for debit notes against purchase bills.

### N5 (P2): TDS or GST-TDS on a receipt with no open invoice is orphaned (REPRODUCED)
- **The gap:** `postReceiptVoucher` debits TDS Receivable and credits Trade Receivables for the full settlement (accountingService.js:686-700). The allocation loop (708-727) only spends deductions against open invoices, and whatever is left is never stored.
- **Repro (`r4_receipts.mjs`):** an order with no posted invoice gets a receipt of 9,800 + TDS 200. Then the invoice is posted and 9,800 is allocated. The invoice stays 200 outstanding forever, and GL vs bill-wise is off by 200.
- **Fix:** refuse deductions when there is no target invoice ("post the invoice first"), or keep the unapplied deductions on the payment row and apply them on the next allocation.

### N6 (P2): Error Console wrongly says "negative stock" for any item whose opening stock was issued (REPRODUCED)
- **Why:** `bookIntegrityChecks` sums `stock_ledger` only (errorConsoleService.js:148-152). Opening stock lives in `items.opening_stock`.
- **Repro (`r3_misc.mjs`):** opening 10, issue 4, `stockBalance` = 6, yet the check reports "fail: 1 item/warehouse pair(s) below zero".
- **Impact:** a false alarm on the screen meant to build trust in the books.
- **Fix:** compute the balance with `stockBalance()` (which adds opening stock in its opening warehouse), or add the opening quantity in SQL.

### N7 (P2): the tamper-evident audit chain doesn't detect deleting the newest rows, and anyone with the file can recompute it (REPRODUCED)
- **Repro (`r3_misc.mjs`):** deleting the last 5 audit rows → `verifyAuditChain` reports 60 verified, 0 broken. Editing a middle row is detected (row 57).
- **Why:** the chain is a plain SHA-256 with no key and no external anchor. A user with file access can rewrite it end to end.
- **Fix:**
  - Compare `MAX(id)` with `sqlite_sequence.seq` for `audit_log`. AUTOINCREMENT keeps the high-water mark, so a deleted tail shows.
  - Store the latest hash and count outside the DB, e.g. in `config/` and in each backup and support bundle.
  - Optionally use an HMAC keyed from OS `safeStorage`.
  - Don't call it "untampered" in the UI until then.

### N8 (P3): business dates are UTC, not Indian local time (REPRODUCED)
- **Where:** `new Date().toISOString().slice(0,10)` sets:
  - the reversal date (accountingService.js:454);
  - the stock-mirror date (inventoryService.js:405);
  - the expense accrual date (init.js:1469);
  - the alert digest's "today" and its once-a-day key (alertService `runScheduled`).
- **Observed:** a reversal was dated 2026-10-17 at 23:54 UTC, which was 05:24 IST on the 18th.
- **Impact:** for 5½ hours every night, entries carry yesterday's date. On 1 April between 00:00 and 05:30 IST, a reversal lands in the previous FY, or is refused if that year is locked.
- **Fix:** one `localBusinessDate()` helper (local calendar date) used everywhere.

### N9 (P3): `audit_log.created_at` format changed (CODE)
- **The change:** `auditLog` now writes ISO `2026-10-17T23:54:32.809Z` (init.js:1597). Older rows and every other table use `YYYY-MM-DD HH:MM:SS`.
- **Impact (inferred):** a string range filter such as `created_at <= 'YYYY-MM-DD 23:59:59'` leaves out same-day ISO rows, because `T` sorts after a space.
- **Fix:** keep the SQLite format, or normalise in every audit query.

### N10 (P3): receipt that names a draft invoice posts silently as Unallocated (REPRODUCED)
- **Repro (`r4_receipts.mjs`):** the receipt posts, 0 allocations are made, and no warning is shown.
- **Fix:** refuse with "post the invoice first", or warn.

### N11 (P3): manual bank match has no company or amount check (CODE)
- **The gap:** `manualBankEntryMatch` (bankReconciliationService.js:478-500) accepts any record id. `alreadyBookedMatch` looks up `payments`/`supplier_payments` by id without a company filter (lines 190, 192).
- **Impact:** a line can be reconciled against another company's receipt.
- **Fix:** add the company filter and an amount check.

### N12 (P3): balance-sheet presentation shifts between years (REPRODUCED)
- **Repro (`r10_bs.mjs`):** FY1 is closed into FY2, FY2 is not closed, FY3 is open. The FY3 sheet ties, but it shows Capital 0 and puts FY1's already-closed profit into "unclosed prior profit" (283,000). The FY2 sheet carries that profit in Capital.
- **Fix:** when the newest carry-forward is older than the previous year, start from that carry-forward and add only the unclosed years' profit.

### N13 (P3): supplier-payment posting is not atomic like the others (CODE)
- **The gap:** `postSupplierPaymentVoucher` (accountingService.js:737-760) uses a bare transaction, records no posting error, and has no IPC posting path (see A10).

### Checked and found sound

- Reversal guards: posted only, a reversal can't be reversed, no double reversal; nested stock and voucher reversal runs once.
- `atomicPosting` rollback, and the no-downgrade rule in `markPostingError` (test 37).
- `assertNotAlreadyPosted`.
- The `nextSeriesNumber` gap and collision handling.
- The BS unclosed-prior-profit fix ties in 3 scenarios (C2, C2b, C2c, r10).
- SMTP refuses a non-TLS server for remote hosts, and verifies certificates by default.
- Alert secrets are kept in `safeStorage` and never returned to the screen.
- The error journal is capped at 500 entries and never throws.
- Per-company reset leaves no orphan child rows (r11).

## 4. Tally-parity gaps (an accountant's view)

| Area | Status here | Tally baseline |
|---|---|---|
| Sales invoice → receivable → receipt | Works. Allocation is oldest-first or to the named invoice, and TDS/GST-TDS now post | Same, plus bill-wise "Agst Ref", "New Ref" and "On Account" |
| Purchase → GRN → bill → payment | GRN and bill work in one order only (N3). **No supplier-payment entry or posting from the app** (A10) | Purchase, Payment, Debit Note and bill-wise payables |
| Credit / debit notes | Credit note posts the right GL direction but doesn't adjust the invoice (N4). No debit note against a purchase bill from billing | Credit/debit notes against original bills, with a GST return effect |
| GST | Single Input GST / Output GST ledgers. CGST/SGST/IGST only as invoice-line fields; place of supply ignored. Renderer-supplied GST amounts post as-is (ARCH-3). No GSTR-1, GSTR-3B, GSTR-2B reconciliation, RCM or ITC reversal | Separate CGST/SGST/IGST/cess ledgers, state-based tax, GSTR-1/3B, e-invoice and e-way bill |
| e-invoicing / e-way bill | **Absent** (no IRN, QR or EWB code anywhere in src/main) | Built in |
| TDS | Received TDS posts to TDS Receivable. No TDS payable on supplier payments, no 26Q/24Q, no TCS | Full TDS/TCS |
| Bank reconciliation | Statement import and matching exist, but crash (N1) and false "Already Booked" (N2). No cheque/PDC register | BRS with bank date, PDC |
| Stock | Weighted average, multi-warehouse, transfers keep value, reversals mirror stock | WAC/FIFO, batches/expiry, BOM, godown transfers, stock journal |
| Opening stock | Item field only, with no GL voucher (IO-22) | Opening stock ties to the Stock-in-hand ledger |
| Year close | Works on clean data with exact carry-forward. **Blocked on any DB with %-based expenses** (A9). Reopen breaks carry-forward (A18). ₹1 BS tolerance | Carry-forward is automatic; no hard close |
| Voucher numbering | Gap-safe, but not per FY for vouchers (A17) | Per-voucher-type series with FY restart |
| Reversal / cancellation | Tally-style: the original stays and a dated reversal is added; the closed year is untouched | Cancel or delete voucher, with audit |
| Round-off, discounts, cost centres, multi-currency | None (no Round Off or Discount ledger in the chart of accounts) | Standard |
| Upgrade of existing data | **Broken from old main** (A3/A4) | n/a |
| Audit trail | Hash chain (N7 limits), actor from the session | Edit log (MCA rule 3(1)) |

Bottom line (inferred from the flows exercised): for a single company that raises GST sales invoices, receives payments with TDS, receives stock by GRN-then-bill and uses fixed-amount expenses, the books now come out right. A business would still need to keep its GST returns, supplier payments, credit/debit notes and bank reconciliation in another tool.

## 5. Production readiness classification

**Internal Testing.**

Why it moved up from Prototype:
- Session-bound IPC, guarded reset and restore, atomic single postings, correct reversal reporting, locked years protected, safe backups.
- 46/46 integrity tests, plus all 6 verify scripts and the build, pass.

Why it is not yet Beta:
- **P1s still open:** N1, N2, N3, ARCH-3 (wrong GST in the GL), A9 (year close blocked) and A10 (no supplier payments).
- **Upgrade P0s still open:** A3/F1 and A4, for anyone moving from old main.
- **Not done:** the Electron desktop click-through of posting, reversal, bank and year-close flows; UAT; and gates that check correct amounts (ARCH-1/2).

Gate results:

| Gate | Result |
|---|---|
| Implementation | yes |
| Verification | pass (shape only) |
| Accounting / financial verify | pass |
| Desktop smoke | not done |
| git status | clean |
| Commit / tag | commits yes, tag n/a |
| Phase report | exists (phase-report.md) |
| Lock note | no |
| UAT | no |
| Limitations | this report |

**Safe to lock: No.**

Recommended next work:
1. N1 and N2 (bank).
2. N3 (GRN order).
3. ARCH-3: recompute GST on the server in `billing:save`.
4. A9: make percentage expenses post, dated on the expense date, and fail loudly when they can't.
5. A3/A4 migration with backup before migrating.
6. A10: supplier payment entry, posting and allocation.
7. N4 and N5.
8. The Electron click-through.

## Addendum 2026-10-18: fix status after commits 47ad517 and ac05ed0

Fixed and covered by tests (`npm run test:integrity`, 55/55): N1–N11, N13, A3/F1, A4, A9, A10, A12, A14, ARCH-3.
Still open: N12 (balance sheet when the newest carry-forward is more than a year old), A15 (drafts post without approval), A17–A19 (no CGST/SGST/IGST ledgers), A22–A24, IO-4–IO-27, F6–F26, SEC-7, SEC-11 (no Content Security Policy).
