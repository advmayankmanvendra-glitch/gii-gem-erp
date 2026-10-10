> **Historical.** This audit was made against `main` at `aec83eb`, not the working branch `acf6d02`. Line numbers and some findings are out of date. For the current status, see [README.md](README.md) and `scripts/audit/critical-defects.test.mjs`.

# GII GeM ERP: Thorough Audit (second pass, 2026-10-07)

**Code audited:** branch `claude/project-thread-grlynv`, which is `main` plus draft PR #1 (backend login session, User Management, expense accrual date).

**Method:** six module reviews, each run against fresh temporary databases with small reproduction scripts. I re-ran every Critical finding and most High ones myself, plus a performance benchmark. **No repository code was changed.**

The first-pass audit is in `repo-audit-2026-10-07.md`. This report replaces its findings list.

---

## 1. Verdict

The first audit undersold the problem. The screens open and the built-in checks pass, but those checks only exercise the happy path. Once you correct, reverse, re-post, transfer, import or roll back, the numbers go wrong.

**Confirmed money-affecting defects:**
- **Reversals:** a posted sales, purchase, receipt or supplier-payment voucher can't be reversed at all; the app crashes.
- **Balance sheet:** it stops balancing from the second financial year, so that year can never be closed.
- **Double counting:** the same receipt can settle two invoices, and a purchase can be booked twice by clicking Post again.
- **Stock value:** a warehouse transfer wipes out stock value, and opening stock is counted in every warehouse.
- **Backups:** restoring a bad backup file destroys the live database with no safety copy.

**Status:** not fit for real books yet. It is a good-looking prototype with a solid structure, and the fixes are mostly small and local. Treat it as **Prototype / Internal Testing**, not Beta, until the P0 list below is fixed and covered by tests.

## 2. Scorecard

| Area | State | Worst confirmed issue |
|---|---|---|
| Accounting core | Broken at edges | Reversal of business vouchers crashes; balance sheet off from year 2 |
| GST / billing / receivables | Broken at edges | One receipt can settle two invoices; advances can exceed the receipt |
| Inventory | Broken | Transfers destroy stock value; opening stock counted per warehouse |
| Imports / bank / backup | Risky | Re-posting doubles purchases; bad restore wipes the database |
| Security / isolation | Improved by PR #1, gaps remain | Change-password bypasses lockout; approvals have no recorded approver |
| Screens / UX | Works, rough | No double-click protection on Post; printed invoice missing item lines and GSTINs |
| Engineering | Weak | No CI, no tests for failure paths, no DB indexes, demo data in every new DB |

---

## 3. P0: fix before anyone keeps real books in it

All of these were reproduced. Line numbers are in `src/main/database/init.js` unless stated.

1. **Reversing any sales, purchase, receipt or supplier-payment voucher crashes.**
   - Where: `reverseVoucher` (~5877–5900) updates an `updated_at` column that `payment_allocations` and `supplier_payment_allocations` don't have. Output: "no such column: updated_at".
   - Impact: posted business documents cannot be corrected at all. The test suite only reverses manual vouchers, so it never caught this.
2. **The balance sheet doesn't tie from the second year.**
   - Where: `balanceSheetReport` (~9109) adds asset and liability balances cumulatively but only the current year's profit. `closeFinancialYear` (~6199) writes carry-forward rows but never posts a closing entry.
   - Impact: after closing FY 2025-26, FY 2026-27 is off by the prior profit, and that year can't be closed.
3. **The same receipt can be applied twice.**
   - Where: `receiptUnallocatedAmount` (~6595, supplier side ~6611) subtracts the advance's *remaining* balance instead of the advance amount.
   - Repro: a ₹1,00,000 receipt taken as an advance, adjusted against invoice A, then allocated again to invoice B. Two invoices were reduced by ₹1,00,000 each.
4. **An advance can be larger than its receipt.**
   - Where: `createAdvanceReceipt` (~6442) and `createSupplierAdvance` (~6455) don't check the amount.
   - Repro: a ₹1,00,000 receipt recorded a ₹5,00,000 advance.
5. **Posting a payment dumps the whole amount on the order's first invoice.**
   - Where: ~5982 and ~6316. There is no cap at the invoice balance.
   - Repro: invoice A went to −₹1,18,000 "Closed" while invoice B stayed open forever.
6. **A second Post click unlocks a posted record, and the next Post books it twice.**
   - Where: the post functions' `catch` marks "already posted" as an Error (~6284, also ~6253 and ~6326).
   - Repro: Trade Payables credited ₹23,600 for an ₹11,800 purchase.
7. **Posting is not atomic, so a retry double-posts.**
   - Where: the sales, purchase and receipt post functions commit the voucher before the receivable or allocation steps.
   - Repro: a forced failure followed by a retry left two sales vouchers for one invoice.
8. **A warehouse transfer destroys stock value.**
   - Where: `stockBalance` (~6823) and the stock summary (~7325) treat "Transfer In" as value going out.
   - Repro: the destination warehouse showed −₹400, and the next issue from it was costed at ₹0.
9. **Item opening stock is counted in every warehouse and company.**
   - Where: `stockBalance` (~6818).
   - Impact: lets you issue stock from an empty warehouse, which drives it to −10.
10. **Restoring a corrupt or wrong backup file destroys the live database.**
    - Where: `src/main/services/backup.js:90-113` does no SQLite or integrity check and takes no pre-restore copy.
    - Repro: the live database was replaced with junk and would not reopen.
11. **The generic save API trusts "Posted" and "Approved" sent from the screen.**
    - Where: `createRecord` (~2864).
    - Impact: a stock adjustment saved as "Approved" posted 100 units worth ₹1,00,000 with no approval step.
12. **Bank statement proposals re-book receipts that are already posted.**
    - Where: ~7583. A statement line matching posted receipt UTR10001 produced a 100%-confidence proposal.
    - Repro: approving it moved the bank balance by ₹3,50,000 a second time.

## 4. P1: high-severity, confirmed or code-traced

**Accounting and GST**
- **"Credit Note" invoice type posts as a sale.**
  - Where: ~6238. It debits receivables and credits sales and GST.
  - Related: guided credit notes don't update the stored receivable and have no cap (~5679, ~6784).
- **Cross-company postings are allowed.**
  - A voucher line can use another company's ledger (~5090), so both trial balances break.
  - A receipt can settle another company's invoice (~6291).
  - A bank proposal can be pointed at another company's account (~7817).
- **Drafts and deleted records get treated as real.**
  - `reverseVoucher` reverses Drafts, which posts one-sided entries (~5835).
  - Soft-deleted invoices can still be posted (~6224).
- **Voucher and invoice numbers come from COUNT+1** (~5031, ~5057).
  - After a manual number or a deleted draft, every new number collides and that series is blocked.
  - Numbers never reset per financial year, and GST needs consecutive invoice numbers.
- **Approval and receipt checks are skipped.**
  - The approval queue is bypassed: posting never checks `approval_status` (~5976).
  - Receipts with "other deductions" can never be posted, because they are always unbalanced (~6313).
- **TDS doesn't add up.**
  - The register double-counts after a reallocation (~8975).
  - TDS on manual allocations never reaches the general ledger (~6355).
  - Reversing an advance adjustment doesn't restore the invoice balance (~6524).
- **Order profitability uses the wrong numbers** (~4887–4900).
  - It treats the taxable value as GST-inclusive.
  - It uses one GST rate per order.
  - "Supplier paid" ignores allocations.

**Inventory**
- **Purchases are counted twice in profit.**
  - Inward posts no voucher, purchases debit the "Purchase" expense account, and issues credit Inventory at cost.
  - Result: the Inventory account goes into credit.
  - Fixing this needs an accounting-policy decision from you.
- **Reservations don't work.** Issues never consume them (status names don't match, ~5419 vs ~7041), two orders can reserve the same units, and deleted orders keep theirs.
- **Back-dated movements are mishandled.** They are accepted against today's balance, so stock can go negative on a past date (~6837).
- **Reversing a stock-issue (COGS) voucher leaves the stock issued** (~5834).
- **Serial and batch tracking isn't enforced, and the registers drift.**

**Imports and data**
- **Import rollback damages live data** (~3863). It soft-deletes masters other records still use, and even posted transactions.
- **A warehouse import in "update" mode can move another company's warehouse, with its stock, into the selected company** (~4494).

**Security** (follow-ups to PR #1)
- **The change-password channel is an unlimited guessing path and clears an active lockout** (`main.js` auth:change-password; init.js ~4975).
- **Approver and actor IDs still come from the screen, and the screen sends nothing.**
  - Approvals record no approver, and maker = checker is never blocked.
  - Generic create, update and delete audit rows have no user, and CRAC changes aren't audited.

**Screens**
- **Inventory reports' Voucher, Source and Ledger drill buttons crash** (`openDrilldown` is undefined there, `App.jsx:9182`).
- **There is no double-click protection on Post, Save and Approve buttons** (`App.jsx` ~8740, 7958, 4791, 4050). Combined with item 6 above, this double-posts.
- **The printed tax invoice is not statutory-ready.**
  - Item rows print "-" because the template reads the screen and the grid cells are input boxes.
  - Seller and buyer GSTIN are missing, and there is no amount in words.
- **CSV export uses raw database keys as headers and doesn't block Excel formula injection** (`utils/formatters.js:18`).

## 5. P2: medium-severity issues

**All Companies View and company scoping**
- All Companies View silently shows the first company's numbers, while the header says "All Companies" (init.js ~8223, ~7121).
- Other "first company" fallbacks still exist; one checks the wrong company's financial year (~5814).
- One dashboard count ignores the selected company (~4546).

**Login session (PR #1)**
- A user deactivated mid-session keeps read access.
- There is no idle timeout.
- Login timing reveals which usernames exist.

**Installer**
- It bundles whatever is in the developer's `database/gii_gem_erp.db`: users, password hashes, audit log and test data.
- `VITE_DEV_SERVER_URL` is honoured in the packaged app.
- There is no CSP or navigation lock.

**Audit log**
- There is no hash chain or tamper protection.
- Any logged-in user can insert arbitrary audit rows through `audit:context`.

**Imports and parsing**
- The XLSX import parser shifts columns when a row has an empty formatted cell (~4128). This happens with ordinary Excel files.
- Text dates shift back one day on Indian-time PCs (~8130, ~4523), so 1 April lands in the previous financial year.
- Companies created by Master Data Tools get no chart of accounts or financial years, and rolling them back does nothing.
- Import lookups aren't company-scoped (~4243).
- Rejected bank proposals leave a draft voucher behind, and that statement line can never be proposed again (~7857).

**Bank, CRAC and payment readiness**
- Payment readiness ignores TDS; the order closure check passes with money still owed; CRAC deletes reset the order status wrongly.

**Days outstanding**
- `days_outstanding` is stored once and goes stale, which makes the "90+ days" control wrong.

**Money and dates on screen and in the ledger**
- Money is stored as floating-point and never rounded; after 500 vouchers the trial balance was off by ₹2.
- Screens round money to whole rupees (`formatters.js`).
- Default report dates start at 2026-01-01, which spans two financial years.
- Some date defaults use UTC, so they show yesterday before 05:30 IST.

**Other screen issues**
- Unsaved-change protection only covers the Esc key; clicking the sidebar or switching company loses form data.
- Validation lets zero-amount payments and negative quantities through.
- Invoice date is never checked against the selected financial year.
- Enter confirms any confirm dialog, including delete and post, wherever focus is.

**Financial years**
- Only FY 2025-26 and 2026-27 are seeded. Posting after 31 Mar 2027 fails until someone creates the next year by hand.
- A locked year can be reopened after carry-forward.

## 6. Engineering and operations

**Demo data in every new database**
- Every new database, including the one copied on a fresh install, gets a demo company and GSTIN, a demo order, invoice, payment and vouchers, and demo stock (`seed()`, init.js ~2200).
- There is no "start clean" option.
- Some demo seeding re-runs whenever its table is empty (for example, stock on first launch with an empty stock ledger).

**Performance**
- The database has **no indexes** except unique keys: none on ledger_entries, voucher_lines, stock_ledger or audit_log.
- `accountingData` returns everything for every accounting screen.
- My benchmark:

  | Vouchers | Load time | Data sent to screen |
  |---|---|---|
  | 2,000 | 0.4 s | 6.8 MB |
  | 10,000 | 6.7 s | 33 MB |

  Load time grows much faster than the data. Inserting 10,000 vouchers took 27 s, roughly quadratic.
- About 10,000 vouchers is one to two years of normal use.

**Dependencies**
- The installer pins Electron 37.0.0. That release line is past its support window (current major is 44), so its built-in Chromium has no security patches.
- `npm audit` reports 13 issues in the Electron tool chain.

**Tests and tooling**
- There is no CI.
- `lint:syntax` doesn't check any screen code.
- There is no test for any correction path: reversal, re-post, rollback, transfer, restore of a bad file. That is why everything in section 3 slipped through.

**Code structure**
- `App.jsx` (13,250 lines) contains a ~1,000-line browser-preview API that ships in the desktop build and has a drifted copy of the profit formula.
- The UX review includes a concrete split plan for `App.jsx` into `features/*`.

## 7. What is sound

- **No SQL injection:** table and column names are allow-listed and values are bound.
- **No unsafe document file paths.**
- **Backup:** the live backup checkpoints the database log correctly.
- **Migrations:** they are atomic.
- **Posted documents:** they can't be edited or deleted through the generic API.
- **Double posting via the same path:** posting a stock movement twice in a row is blocked.
- **PR #1:** it closed the "everything runs as admin" hole. Role checks now work in the app.
- **Electron sandboxing:** context isolation and sandbox are on.
- **Support bundle:** it excludes password hashes.

## 8. Missing for an Indian GST trading business (gaps, not bugs)

- **GST filing:**
  - No e-invoice (IRN/QR) or e-way bill.
  - No GSTR-1, GSTR-3B or HSN summary, and no GSTR-2B input-credit matching.
- **GST accounts and tax:**
  - No CGST, SGST, IGST or cess ledgers, and no company state for place-of-supply checks.
  - No round-off ledger.
  - No TDS payable (194C/194Q), and GST-TDS isn't checked against the taxable value.
- **Credit notes:** no credit-note link to the original invoice and no time-limit checks.
- **Inventory:**
  - No stock-movement reversal or cancellation of any kind.
  - Valuation is weighted-average only.
  - No stock ageing report.
  - Adjustments and returns post nothing to the general ledger.
- **Periods and reporting:**
  - No month-level period lock and no automatic next financial year.
  - No Schedule III statements.

## 9. Recommended order of work

Each phase gets its own PR, with tests that reproduce the bug first, per the repo's AGENTS.md.

1. **Phase 17: posting integrity.**
   - P0 items 1, 6, 7 and 11, the Draft/deleted checks, and approval enforcement.
   - Double-click guards on Post buttons.
   - Sequence-based numbering per company and financial year.
   - Regression tests for each.
2. **Phase 18: receivables and advances.** P0 items 3, 4 and 5, credit-note handling, TDS register and GL posting, and the cross-company checks.
3. **Phase 19: year-end.** Closing entry and the balance-sheet carry-forward (P0 item 2), the locked-year rules, and automatic next-financial-year creation.
4. **Phase 20: inventory valuation.** P0 items 8 and 9, the reservations fix, back-date handling, COGS reversal, and the Inventory vs Purchase accounting decision.
5. **Phase 21: data safety.**
   - Safe restore (P0 item 10) and rollback limits.
   - Bank proposal duplicate checks (P0 item 12).
   - Import parser and date fixes, and company-scoped imports.
   - A clean first-run database without demo data.
6. **Phase 22: security follow-ups.**
   - Change-password lockout and session-recorded actors and approvers.
   - Live session checks and idle timeout.
   - Audit-log hardening, packaged-build hardening, Electron upgrade.
7. **Phase 23: engineering.** CI running all verify scripts, real ESLint, database indexes, paged reports, and the `App.jsx` split.
8. **Phase 24: GST compliance.** CGST/SGST/IGST ledgers, statutory invoice print, GSTR-1/3B export, then e-invoice and e-way bill if your turnover requires them.

**Decisions needed from you before the relevant phase** (AGENTS.md rule 4: they change posting math):
- Phase 17: posting order and numbering format.
- Phase 19: the closing-entry method.
- Phase 20: whether purchases go to an Inventory asset account or stay as an expense.
