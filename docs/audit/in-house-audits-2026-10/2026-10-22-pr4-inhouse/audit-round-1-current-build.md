# In-house audit, round 1: current build (PR #4)

Branch `claude/erp-full-automation-qbhv8k` at `dc73221`, scope `git diff acf6d02..dc73221`. Read-only review on 2026-10-22. Suspected defects were confirmed with throwaway scripts in the session scratchpad (`inhouse1/t1`–`t7`), each using its own temporary data root. The four integrity suites pass: 64/64.

## Verdict

Posting, reversal, GST computation, the reset itself and go-live verification are sound on the paths I exercised. The defects below are in what surrounds them. The two rollback paths restore a whole-database snapshot with no guard on age or company. Advance adjustments can be made against reversed or unposted documents. Supplier returns and GRN-to-bill matching trust links the server never checks. The go-live wizard's precondition screen ignores the selected company. Nothing here is a P0, but F1 and F2 can silently erase days of other companies' work, so they should be fixed before any multi-company go-live. Still pending the owner and not re-reported: the percentage expense base in `calculateProfitability`/`postExpenseEntry` (billing_value is the taxable value).

## Findings

### F1 (P1): go-live rollback restores any history entry, including a completed go-live
- **Where:** `src/main/services/deployment/goLiveService.js:149`, `rollbackService.js:36-55`, IPC `go-live:rollback` (`main.js:1263`)
- **Defect:** `failGoLiveWithRollback` never checks the entry's status or age. It restores that run's `pre_golive` snapshot over the whole database.
- **Scenario:** A go-live completes for company A. Weeks later someone with `restore_backup` calls `go-live:rollback` with that `goLiveId`. The database returns to the pre-go-live state, and every voucher posted since is lost, in every company. Only the `pre_restore_` safety copy is left.
- **Evidence:** Confirmed by running (t3). The entry was marked `completed` and a voucher was posted afterwards. Rollback succeeded and the voucher count went 11 → 10.
- **Fix:** Allow rollback only while status is `in_progress` or `failed`. Refuse if any voucher or audit row was written after the entry's reset, unless the user gives an explicit override that is audited.

### F2 (P1): reset rollback with no backup named restores the newest `pre_reset_` file of any company
- **Where:** `src/main/services/operationalResetService.js:341-346`. `EnvironmentManagerScreen.jsx:312` always sends `""`.
- **Defect:** With an empty identifier, the server picks the most recent `pre_reset_*` backup, falling back to `backups[0]`. The screen never passes the `resetResult.backup.fileName` it already holds.
- **Scenario:** Company A is reset, then company B is reset. A's user clicks Rollback. B's pre-reset snapshot is restored, so A stays wiped, B's reset is undone, and everything else written since B's reset is lost. If no `pre_reset_` file exists, an arbitrary newest backup is restored.
- **Evidence:** Confirmed by running (t3). `rollbackReset(root, "")` restored the reset-2 backup, and company 1 still had 0 vouchers.
- **Fix:** Require the backup name, and have the screen send `resetResult.backup.fileName`. Check that the backup's audit row names the same company. Warn that the restore covers the whole database. Also fix the "Restart the app" toast, because the restore is immediate.

### F3 (P2): advance adjustment accepted against a reversed invoice or an unposted purchase bill
- **Where:** `src/main/services/accountingService.js:911-935` (`adjustAdvanceReceipt`) and `:941-960` (`adjustSupplierAdvance`)
- **Defect:** Neither function checks `posting_status`. The outstanding amount is recomputed from `invoice_amount` (or from the bill's own value), and the reversed or draft status is ignored.
- **Scenario:** An invoice of ₹1,000 is posted and then reversed, leaving the receivable `Reversed` with 0 outstanding. Someone then adjusts a ₹500 advance against it. `refreshReceivable` reopens the receivable as `Open` with ₹500 outstanding, the advance closes, and the GL shows no receivable for that invoice. In the same way, a supplier advance can be consumed by a Draft bill.
- **Evidence:** Confirmed by running (t1): status went `Reversed/0` → `Open/500`, and the supplier advance was adjusted against a `Draft` bill.
- **Fix:** Require `posting_status = 'Posted'` and a receivable that is not `Reversed`. This is the same guard `createReceiptAllocation` and `createSupplierPaymentAllocation` already use.

### F4 (P2): returning unbilled goods to a supplier debits Trade Payables instead of GRNI
- **Where:** `src/main/services/inventoryService.js:341-351` (`isReturnBilled`), used at about line 383
- **Defect:** A return counts as "billed" if the supplier has any posted bill on the order, or on any order at all when the return has no `order_id`. Whether the returned item or receipt was billed is never checked.
- **Scenario:** Item A is received and billed for ₹1,000. Item B is received for ₹1,000 but not yet billed. When B is returned, the entry is Dr Trade Payables ₹1,000 / Cr Inventory. A's bill now looks settled, and GRNI keeps ₹1,000 of liability for goods that went back.
- **Evidence:** Confirmed by running (t2): Trade Payables +1,000, GRNI change 0.
- **Fix:** Decide from the returned goods' own inward. Use Payables only when that inward's `procurement_id` points to a posted bill, otherwise GRNI. Book the GST part of a billed return as a debit note.

### F5 (P2): cross-company links are not validated, and postings follow them
- **Where:** `src/main/services/accountingService.js:638-642` (GRN value summed by `procurement_id` with no company filter); `inventoryService.js:205` (`billedFirst`); `inventoryService.js:449` (`consumeReservations` by `order_id`); generic `createRecord` in `crudHelpers.js:300-345`
- **Defect:** `records:create` accepts `order_id`, `procurement_id` and `warehouse_id` from another company. The posting queries then join on those ids without checking the company.
- **Scenario:** A company-1 stock inward linked to a company-2 bill posts Dr Inventory / Cr GRNI in company 1. When the company-2 bill posts, it clears GRNI it never held, leaving company-2 GRNI at +1,000 and Purchase at 0. Company 1 is left with a GRNI liability that never clears. The procurement was also accepted with company 1's `order_id`.
- **Evidence:** Confirmed by running (t5).
- **Fix:** In `createRecord`/`updateRecord`, reject foreign keys whose `company_id` differs from the record's own, using the same rule `saveBillingVoucher` and `createDeliveryChallan` now apply. Add `si.company_id = ?` to the GRN-value and `billedFirst` queries.

### F6 (P2): go-live precondition screen ignores the selected company
- **Where:** `src/main/main.js:1241` (`go-live:preconditions`) and `:1229` (`deployment:readiness`)
- **Defect:** `handle()` calls `handler(event, ...args)`, but these handlers take `(payload = {})`. They receive the IPC event, so `payload.company_id` is always undefined, and readiness is computed for all companies.
- **Scenario:** In the wizard, step 1 passes on whole-database data. Then `go-live:execute`, which correctly checks the selected company, refuses after the user has typed GO-LIVE. The reverse also happens: another company's figures (GST net, trial balance) block the wizard for a clean company.
- **Evidence:** By reading. The wizard sends `{ company_id }` at `GoLiveWizard.jsx:76`.
- **Fix:** Change the signatures to `(_event, payload = {})`.

### F7 (P3): reversing an issue inflates its stock reservation
- **Where:** `src/main/services/inventoryService.js:466-477` (`releaseReservations`). Related: `:449` ignores `is_deleted`.
- **Defect:** The amount given back is added to `balance_reserved` without a cap at `reserved_quantity − issued_quantity`. The over-take that `consumeReservations` allows on the last reservation makes this reachable.
- **Scenario:** 5 are reserved, 8 are issued, then the issue is reversed. `balance_reserved` becomes 8, holding back 3 units nobody reserved and distorting the reserved-value and shortage reports.
- **Evidence:** Confirmed by running (t6).
- **Fix:** Cap the release at `reserved_quantity − new issued_quantity`, and filter `COALESCE(is_deleted,0)=0` in both queries.

### F8 (P3): readiness fails any company whose input GST exceeds output GST
- **Where:** `src/main/services/deployment/readinessService.js:107`
- **Defect:** "GST input/output reconciled" passes only when output ≥ input, but carrying input credit forward is normal.
- **Scenario:** If the trial data held more purchases than sales, readiness can't reach "Production Ready", so `executeGoLiveReset` refuses, even though go-live exists to wipe that data. The user has to run a plain reset first.
- **Evidence:** By reading.
- **Fix:** Drop the sign test, or replace it with a check that GST ledgers agree with the GST registers.

### F9 (P3): go-live history entry stays `in_progress` when the reset throws
- **Where:** `src/main/services/deployment/goLiveService.js:76-91`
- **Defect:** The entry and the `pre_golive` backup are recorded before `executeEnhancedReset`, which can still refuse (for example a missing company or wrong confirmation). The entry is never marked failed.
- **Scenario:** The history shows a phantom running go-live. Because of F1, that entry can later be "rolled back".
- **Evidence:** By reading.
- **Fix:** Wrap the reset in try/catch and set status `failed` with the error.

## Areas checked and found clean

- Per-company reset followed by reopen: no reseeding, no leftover rows, and go-live verification passes (t7).
- `createRecord` forces new transactions to Draft. Updating a posted payment is refused (t4).
- Receipt posting: named-invoice company and posted checks, and stranded-deduction refusal. Credit-note mirror posting.
- Server-side GST split on invoices. Invoice company is taken from the supply order.
- Purchase bill clearing GRNI after a GRN. GRN after the bill moving value from Purchase to Inventory (audit-1 tests).
- Reversal: date rule, single mirror of stock, guided-voucher stock reversal limited to its own company, invoice-reversal advance release.
- Bank "Already Booked" matching (company, amount, 10-day window, claimed check). Proposal ledger company guard.
- `backup:restore` closes and reopens the database. Restore validates the SQLite header, integrity and ERP tables.
- IPC: every write channel added in this diff is `guarded`. The actor is overwritten from the session. Super-admin password reset is protected.
- Audit hash chain, including detection of deleted newest rows.
- Alert digests are scoped to one company.
