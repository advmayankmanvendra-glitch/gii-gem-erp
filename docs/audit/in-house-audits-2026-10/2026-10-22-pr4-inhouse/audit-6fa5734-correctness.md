# Correctness audit: commit 6fa5734 (fixes for the 2026-10-22 in-house audits)

Branch `claude/erp-full-automation-qbhv8k`, audited 23 Oct 2026, 03:15 IST. Every probe ran against a clean export of 6fa5734 (`git archive`), because the shared working tree was being edited while this audit ran.

## Verdict

**Not clean. One P1, three P2 and five P3 findings.** No regression breaks posting, stock or the test suite: `npm run test:integrity` passes, with 76 plus 16 tests.

These fixes are right:

- The advance guards.
- The GRN and `billedFirst` company filters.
- The reservation cap and the `is_deleted` filters.
- The readiness GST check.
- The go-live and readiness IPC signatures.
- The GO-LIVE confirmation.
- The named-backup reset rollback.
- The session re-check.
- The xlsx inflate caps.
- The IST date maths.

`assertLinksInCompany` blocks only true cross-company links. It allows warehouses and banks whose `company_id` is NULL. Warehouses and banks are company-specific masters, and the pickers are already filtered by company.

The main gap is the go-live rollback fix (F1 of round 1). It checks only the status, so a rollback can still erase live work. Two other gaps are behaviour choices the owner should confirm: the bank-detail gating locks accountants out of the bank master, and it doesn't cover new records.

## Findings

### C1 (P1): a go-live rollback still erases work done after a failed or never-completed go-live
- **Where:** `src/main/services/deployment/goLiveService.js:160-176` (`ROLLBACK_ALLOWED_STATUSES = in_progress, failed, rollback_failed`)
- **Defect:** The guard looks only at the status and at whether the run is the latest one. Round 1 asked for two refusals, and neither was added:
  - refuse when vouchers or audit rows were written after the entry's reset;
  - otherwise require an explicit override that is audited.
- **Scenarios:**
  1. A go-live reset throws, so the new code marks the entry `failed` (F9 fix) and the books are unchanged. The office keeps working for weeks. Someone rolls back that run, and its `pre_golive` snapshot overwrites every company. Round 1 F9 had already warned of this.
  2. A reset succeeds but nobody presses Complete, so the entry stays `in_progress` while live entries are posted. A rollback erases those entries.
- **Evidence:** Confirmed by running (`/tmp/corr-6fa5734-xlVk/golive.mjs`). In both cases `failGoLiveWithRollback` returned `success: true` and the company count went from 2 to 1, so the row added after the attempt was lost.
- **Fix:**
  - Do not allow rollback for a `failed` entry that has no `resetResult`: nothing was reset, so there is nothing to undo.
  - For the other cases, refuse when `MAX(audit_log.id)` or `MAX(vouchers.id)` is beyond a high-water mark stored on the entry at reset time, unless an override is given and audited. Also store the time of the reset and show it in the refusal.

### C2 (P2): supplier return booked to Trade Payables while its receipt is still unbilled (pool is wrong)
- **Where:** `src/main/services/inventoryService.js:342-361` (`isReturnBilled`)
- **Defect:** `returnedAgainstGrni` subtracts every earlier return that debited GRNI, including returns whose receipt has since been billed. Those returns no longer reduce the unbilled pool.
- **Scenario:**
  1. Receipt A (10 units, linked to a draft bill P) is posted.
  2. 2 units are returned. This goes to GRNI, which is correct.
  3. Bill P is posted.
  4. Receipt B (5 units, draft bill Q) is posted.
  5. 4 units of B are returned. The pool is 5 − 2 = 3, which is less than 4, so the return is posted Dr Trade Payables 400. B was never billed, so it should be Dr GRNI 400.
- **Evidence:** Confirmed by running (`returns.mjs` S1): second return gave `{grni: 0, payables: 400}`; expected `{grni: 400, payables: 0}`. The old rule booked this to Payables too, so this is an incomplete fix, not a regression.
- **Fix:** Count only earlier GRNI returns that match receipts which are still unbilled. Better: link each return to its inward (`stock_returns.inward_id`) and decide from that inward's `procurement_id`.

### C3 (P2): a return larger than the unbilled quantity goes wholly to Payables
- **Where:** `inventoryService.js:361` (all-or-nothing `<` test) and the voucher at `:389-404`.
- **Scenario:** 5 units are billed and 3 are received but not billed. A return of 5 posts Dr Trade Payables 500. It should post Dr GRNI 300 and Dr Trade Payables 200. GRNI keeps 300 for goods that have gone back.
- **Evidence:** Confirmed by running (`returns.mjs` S2): `{grni: 0, payables: 500}`.
- **Fix:** Split the return value. The unbilled part, up to the remaining pool, goes to GRNI and the rest goes to Trade Payables, in one balanced voucher.
- **Related, pre-existing:** `accountingService.js:638-646` clears GRNI for the full inward value even after a pre-bill return. GRNI then ends up over-cleared by the value returned (in S1, by 200). Fix it together with C2.

### C4 (P2): accountants can no longer create or edit any bank account (owner should confirm)
- **Where:** `src/main/services/bankDetailsPolicy.js:5,16` (`ADMIN_ONLY_TABLES = banks`, any write reports a change), `main.js:1099-1112`
- **Defect:** Every create, update or delete on `banks` needs `settings`, even when only `remarks`, `status` or `opening_balance` changes. The accountant role has `opening_balance` but not `settings`. The Quick Create Bank dialog (`QuickCreateMasterDialog.jsx:96`) and the banks stage of the Tally migration (`TallyMasterMigrationAssistantScreen.jsx:25`, which goes through `imports:confirm`) now fail for accountants.
- **Evidence:** Confirmed by running (probe `P-banks-accountant`). An accountant got `Permission denied: settings` when creating a bank, and again when editing only `remarks`.
- **Fix:** Use the same field-level rule as suppliers. Gate only `bank_name`, `account_number`, `ifsc` and `branch` on update. If the owner really wants banks to be admin-only, keep the rule but state it in the release notes and hide the quick-create bank option for those roles.

### C5 (P3): bank-detail gating does not cover new records
- **Where:** `bankDetailsPolicy.js:17-18` (returns `[]` when `oldRecord` is null), `main.js:1100`, `importValidationService.js:411-413` (updates only), `bankDetailsPolicy.js:33` (master import checks `updated` rows only)
- **Scenario:** A data-entry operator creates a supplier, or a company, with bank details that they choose. They can do this through `records:create`, through a bulk import of new rows, or through a master-data import of a new code. Payments can then be made to that account. The commit message says bank details "need the settings permission".
- **Evidence:** Confirmed by running:
  - `records:create suppliers` with an account and IFSC was accepted for a data-entry operator;
  - `records:create companies` with bank fields was accepted;
  - a master-data import of a new supplier with `account_number` and `ifsc` gave `ok`.

  Updates were refused correctly in all three paths.
- **Fix:** On create, treat any non-empty bank field as a change. Alternatively, accept the record but save its bank fields as "pending admin verification". Either way, write the `bank_details_changed` audit row on create too: today it is written only by `records:update`.

### C6 (P3): CSV formula escaping misses the main export paths
- **Where:** `src/renderer/utils/formatters.js:23-26,38-47` (`exportRows`, used by 10 screens for list and report export), `src/main/services/feedbackService.js:62-74` (feedback CSV, which holds free text that users type)
- **Defect:** Only the three `csvCell` copies named in the security audit were changed. The commit message says "CSV exports neutralise formula cells", but the generic exporter and the feedback export still write `=…`, `+…` and `@…` cells as they are.
- **Evidence:** By reading.
- **Secondary:**
  - The number exemption `^-?\d+(\.\d+)?$` doesn't cover a value such as `-1,234.50`, `-.5` or `+91…`, so these get a leading `'`. In the master-data round trip, `importValue` takes the `'` off again. The renderer import parsers don't, so a re-imported template or error file keeps it.
  - `importValue` removes the `'` only before `= + - @`, so a cell neutralised for a leading tab or CR doesn't round-trip.
  - The same helper is copied three times.
- **Fix:** Use one shared helper, apply it in `exportRows` and in `exportFeedback`, and widen the number exemption to formatted numbers.

### C7 (P3): the xlsx total cap counts parts that are never read
- **Where:** `src/main/services/importParserService.js:125-139`
- **Defect:** Every `xl/*.xml|rels` part is inflated and counted against the 128 MB total. That includes all worksheets, styles, pivot caches and drawings, but `parseXlsx` reads only `workbook.xml`, its rels, `sharedStrings.xml` and the first sheet. A large multi-sheet workbook under 25 MB can be refused, even though the sheet being imported is small. The inflate work for those parts is also wasted.
- **Evidence:** By reading. The cap behaviour itself was confirmed on Node 22: `inflateRawSync` with `maxOutputLength` throws `ERR_BUFFER_TOO_LARGE`, which the code catches.
- **Fix:** Read the central directory first. Inflate only the 3 fixed parts, plus the sheet that the workbook rels point to.

### C8 (P3): smaller gaps in the cross-company link check and the gating helpers
- **Where:**
  - `crudHelpers.js:328-331` and `:379-381`: `supply_orders` and `procurement_plans` return before `assertLinksInCompany` runs. `procurement_plans` has `order_id` and `warehouse_id`.
  - `main.js:1236` uses `bankDetailDeleteNeedsAdmin(table)` to gate imports. As a result, any import into `companies` now needs `settings`, while `records:create companies` needs only `create`.
- **Evidence:** By reading.
- **Fix:**
  - Call `assertLinksInCompany` in the procurement-plan create and update paths.
  - Give the import gate its own predicate, and make companies consistent across the create and import paths.

### C9 (P3, pre-existing, not a regression): warranty expiry overshoots at month end
- **Where:** `inventoryService.js:123-127`
- **Defect:** `setUTCMonth` overflows. For example, 2026-01-31 + 1 month gives 2026-03-03, and 2024-02-29 + 12 months gives 2025-03-01. The IST one-day shift is fixed. `creditDueDate` is correct: 2026-10-22 + 30 gives 2026-11-21 in IST.
- **Evidence:** Confirmed by running with `TZ=Asia/Kolkata`.
- **Fix:** Clamp to the last day of the target month.

## Checked and found correct
- **Posting:**
  - The advance guards refuse a draft or reversed invoice and a draft bill (`accountingService.js:918-920,949-951`).
  - The GRN value and `billedFirst` queries are now company-filtered.
- **Reservations:**
  - The release cap gives `min(balance+give, reserved−issued)`: 5 reserved and 8 issued, then reversed, now gives balance 5 (was 8).
  - The `is_deleted` filters are added, and the `stock_reservations.is_deleted` column exists.
- **Go-live and reset:**
  - The wizard sends the GO-LIVE text that was typed, and the service checks it.
  - The inner reset gets `RESET`.
  - A failed reset is recorded as `failed`.
  - The history is newest-first (`unshift`), so the `history[0]` "latest" check is right.
  - The reset rollback restores only a named file, and the screen sends `resetResult.backup.fileName`, which matches the names `listBackups` returns.
- **`assertLinksInCompany`:**
  - All 9 mapped columns point to the tables they are mapped to (checked against the schema's FK list).
  - Rows whose `company_id` is NULL are allowed.
  - Update merges the old record, so editing a record whose links are clean still works.
  - A full supplier form that a data-entry operator saves with unchanged bank fields (`null` against `""`) passes.
- **Session:**
  - `sessionUser` re-reads `users`. A disabled or deleted user, or a changed username, clears the session.
  - `withDatabaseClosed` is synchronous, so no IPC call sees `db = null` partway through.
  - `auth:logout` is public, so a user who was disabled can still sign out.
- **Other channels:**
  - `audit:context` allows every action the renderer sends: `company_scope_changed`, `company_switched`, and `import company mapping approval`, which the old regex wrongly blocked.
  - `updates:install` uses the user that `enforcePermission` returns, so `installer.id` is valid.
- **Imports:** The bank-update gating in bulk import and master-data import refuses a data-entry operator and rolls back the transaction.

## Scratch material
The probes and their outputs are in `/tmp/corr-6fa5734-xlVk/`:
- `probe.test.mjs`, the IPC harness, with output in `probe-log.json`;
- `golive.mjs`;
- `returns.mjs`;
- `cols.mjs`, the link-column survey.

The clean export of 6fa5734 that they ran against is in `/tmp/corr-6fa5734-xlVk/tree`.
