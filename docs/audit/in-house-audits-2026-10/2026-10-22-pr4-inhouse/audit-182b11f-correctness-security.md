# Audit of 182b11f: correctness and security

- Commit: `182b11f` ("Address Copilot review and the audits of 6fa5734"), branch `claude/erp-full-automation-qbhv8k`
- Diff reviewed: `git diff 6fa5734 182b11f` (41 files)
- Audited: 23 Oct 2026, 03:40 IST
- Method: read the diff and the code around it; scratch IPC and service tests in `/tmp/audit182/t/`; the same scratch test run against an export of `6fa5734` (`/tmp/audit182/old`) to tell regressions apart from older behaviour. Nothing in the repo was edited.
- Baseline: `npm run test:integrity` passes (78/78 and 18/18). `npm run lint:syntax` passes.
- Note: the working tree has uncommitted edits in 5 files that are not part of 182b11f (`scripts/validate-cor1.mjs`, `goLiveVerificationService.js`, `errorConsoleService.js`, `HelpAssistantRecentErrors.jsx`, `ReadOnlyReportFamilyScreen.jsx`). None of them is on a path these tests use.

## Verdict

**Not clean. One High finding blocks merge.**

Moving the bank-details rule into crudHelpers closed the bypasses it targeted. Alias names, omitted fields and import paths are all caught now, and I found no remaining route that writes bank fields without the check. But the check now compares the fully filled row, so it blocks ordinary edits it should allow. A data-entry operator, accountant or manager can no longer save any edit to a supplier created through Master Data Tools with bank details, even when the full unchanged row is sent. The same happens for any employee or bank master whose bank fields are not on the edit form. This is a regression from 6fa5734 and I reproduced it through the real IPC handlers.

The go-live, xlsx and supplier-return findings are Medium. The CSV guard, the `api/client.js` change, the dashboard drilldowns and the will-navigate change are clean.

| # | Severity | Area | Regression in 182b11f? |
|---|---|---|---|
| F1 | **High** | Bank-details rule blocks legitimate saves; admin edits wipe hidden bank fields | Yes (the block); the wipe is older |
| F2 | Medium | Go-live high-water mark ignores orders, masters and drafts | New guard, incomplete |
| F3 | Medium | A missing `resetResult` is read as "never reset", so a reset that really ran can be refused rollback | New |
| F4 | Medium | A tiny `.xlsx` freezes the main process through quadratic regex scanning; the new caps do not cover it | Older, not fixed |
| F5 | Medium | Supplier return puts the gap between average cost and receipt cost into Trade Payables | New behaviour |
| F6 | Low | A supplier return worth less than 0.005 can no longer be posted | New |
| F7 | Low | Go-live history validation is shallow; writes are not atomic | Partly new |
| F8 | Low | Bank guard fails open without an actor; delete is audited before the outcome is known; import rollback deletes companies without the gate | New / older |
| F9 | Info | Small inconsistencies (banks policy comment, quick-create, preview CSV, duplicate rules) | — |

---

## Findings

### F1 (High): the bank-details rule blocks routine edits, and admin edits silently wipe hidden bank fields

**Where:**
- `src/main/database/crudHelpers.js:407` (`guardSensitiveWrite(db, table, data, oldRecord)`, where `data` is the `cleanPayload` output)
- `src/main/database/crudHelpers.js:89-91` (`cleaned[field] = payload[field] ?? ""` for every column)
- `src/main/database/crudHelpers.js:72-80` (`bank_details` is rebuilt whenever it is blank)
- `src/main/services/bankDetailsPolicy.js:38-42`
- `src/main/database/init.js:1751-1764`

**What happens.** `cleanPayload` fills every column the payload leaves out with `""`. The supplier normaliser then builds `bank_details` whenever that field is blank and an account number, bank, IFSC or branch exists. The guard compares this filled row with the stored row, so any bank column the client did not send counts as being "changed to blank". 6fa5734 compared only the keys the client sent.

**Scenarios (each run through `records:update` / `imports:confirm` in main.js, with the edit form's real field lists from `src/renderer/config/viewDefinitions.js`):**

1. **Suppliers.** Master Data Tools never writes `bank_details`, so it stays `NULL` on suppliers it imports. A data-entry user edits only `remarks`:
   - with the full unchanged row: `Permission denied: settings` (6fa5734: OK)
   - through the Supplier Master form: denied
   - through a generic import update (`imports:confirm`, update mode): denied (6fa5734: OK)

   Cause: the normaliser builds `bank_details`, and the result differs from `NULL`. Every supplier imported with bank details is now read-only for non-admins.
2. **Employees.** The Employee Master form sends only name, mobile, designation, incentive and status. An employee whose `bank_name`, `account_number`, `ifsc` or `branch` came from Master Data Tools cannot be edited by an accountant. Changing the designation gives `Permission denied: settings` (6fa5734: OK).
3. **Suppliers with `upi_id`.** `upi_id` is not on the Supplier Master form. Any supplier with a UPI ID blocks every non-admin form edit.
4. **Banks.** `branch` is gated but not on the Bank Master form. A bank with a branch (Master Data Tools sets it) blocks an accountant's opening-balance edit. This contradicts the policy comment, which says only account number and IFSC are gated on existing banks.
5. **Admins.** The same form edit goes through and blanks `bank_name`, `account_number`, `ifsc` and `branch` on the employee. It is now also logged as `bank_details_changed`. The data loss itself comes from the older `cleanPayload` overwrite, but the new rule makes it look like a deliberate bank change.

**Evidence (run).** `/tmp/audit182/t/bank-forms.test.mjs`. Output at 182b11f:
```
employee designation edit (accountant): Permission denied: settings ...
supplier remarks edit (accountant): Permission denied: settings ...
bank opening-balance edit (accountant): Permission denied: settings ...
admin employee edit: OK bank fields after: {"bank_name":"","account_number":"","ifsc":"","branch":""} audit: {"action":"bank_details_changed",...}
imported bank_details: null
DEO full-row remarks edit: Permission denied: settings ...
DEO generic import update: Permission denied: settings ...
```
At 6fa5734 the same script gives OK for the employee, supplier, full-row and import-update cases.

The new test in `ipc-security.test.mjs` did not catch this for two reasons. Every edit it makes sends `{ ...record }`, never a form-shaped payload. And the seeded supplier already has a non-empty `bank_details`.

**Fix.**
- In `updateRecord`, merge the stored row under the payload before cleaning: `cleanPayload(table, { ...oldRecord, ...payload })`. Use the payload's own keys only for what the client actually sent.
  - Omitted fields are then kept, which stops both the false denials and the admin wipe.
  - An alias such as `account_number` can no longer overwrite a stored `supplier_account_number`, because `||=` only fills blanks. The anti-bypass property holds.
- Exclude the derived `bank_details` text from the comparison when it was empty and is only being rebuilt. Alternatively, compare a normalised version of it.
- Add form-shaped IPC tests. Use exactly the fields of `masterViews.suppliers`, `masterViews.employees` and `masterViews.banks`, on records created by Master Data Tools.

---

### F2 (Medium): the go-live high-water mark does not cover the work a rollback would erase

**Where:** `src/main/services/deployment/goLiveService.js:164` (`HIGH_WATER_TABLES = ["vouchers", "invoices", "payments", "procurements", "stock_ledger"]`).

**Scenario.** After a go-live reset, users enter supply orders and order items, draft expense entries, draft stock documents, new suppliers or items, documents and users. None of these touches the five tables. `assertGoLiveRollbackSafe` lets the rollback through, and restoring the pre-go-live backup erases all of that work. The reset clears `supply_orders`, `order_items`, `expense_entries` and `stock_inwards`, among others (`operationalResetService.js` RESET_TABLES), so all of them are post-reset work by definition.

**Evidence (run).** `/tmp/audit182/t/services.test.mjs`, "go-live rollback guards". After creating a supply order, a supplier and a draft expense on top of a recorded high-water mark:
```
rollback after new supply order / supplier / draft expense: ALLOWED (work would be erased)
```

**Fix.**
- Take the high-water mark over every table in `RESET_TABLES`, plus the masters the reset keeps (`suppliers`, `items`, `employees`, `government_departments`, `banks`, `documents`, `users`).
- Or compare `MAX(id)` and `COUNT(*)` over all user tables from `sqlite_master`, excluding `audit_log` and session/journal tables.

Entries with no `highWater` (runs recorded before this commit) currently skip the check (`if (!entry?.highWater) return;`). Make them fail closed or require an explicit override.

---

### F3 (Medium): a reset that really ran can be refused rollback as "never reset the books"

**Where:** `goLiveService.js:195-197` (`if (!current.resetResult) return refused`) and `goLiveService.js:94-114`.

**Scenario.** `executeEnhancedReset` succeeds and the books are wiped. Then `rebuildZeroState` throws, or the following `updateGoLiveEntry` fails. Two ways that can happen:
- On Windows, antivirus or a file lock gives EBUSY/EPERM on `go-live-history.json`.
- With the new fail-closed reader, a damaged history file makes it throw.

Either way the entry stays `in_progress` with no `resetResult` and no `highWater`. The rollback is refused with "never reset the books ... nothing to roll back", which is false. The only legitimate "never reset" entry is the one written in the reset's `catch`, because the reset is transactional. That `catch` is the only place that can positively say so.

**Evidence (run).** An `in_progress` entry without `resetResult` gives `Rollback refused: go-live GL-0002 never reset the books (it stopped before the reset)`.

**Fix.**
- Write a positive marker: in the `catch` at line 98, set `resetRolledBack: true` (or `resetStatus: "not_run"`), and refuse only when that marker is present.
- Before calling `executeEnhancedReset`, set `resetStatus: "started"` on the entry, so an interrupted run is recognisable.
- Keep the high-water check fail-closed when `highWater` is missing on a `started` run.

---

### F4 (Medium): a crafted `.xlsx` under 1 KB freezes the main process; the new caps do not stop it

**Where:** `src/main/services/importParserService.js:168` (`/<row[^>]*>([\s\S]*?)<\/row>/g`) and `:170` (`/<c([^>]*)>([\s\S]*?)<\/c>/g`), reached from `imports:parse-buffer` (any user with `import`) and `imports:parse-file`.

**Scenario.** A sheet XML holds many `<row>` (or `<c ...>`) opening tags and no closing tag. At every start position the lazy group scans to the end of the string, so parsing time grows with the square of the tag count. Deflate shrinks the repeated tags to a few hundred bytes, so the 25 MB file limit and the 64 MB / 128 MB inflate caps never trigger. The 2,000,000-cell and XFD-column caps don't trigger either, because the cell loop is never reached (or is reached only once). Parsing runs synchronously in the Electron main process, so the whole app hangs, including the other windows and the alert timer. This behaviour is older than 182b11f, but the commit's caps and its test ("refused quickly") suggest the parser is now safe against crafted files, and it is not.

**Evidence (run).** `/tmp/audit182/xlsx-redos.mjs`:
```
 5000 unclosed <row>  zip 236 B   63 ms
10000 unclosed <row>  zip 275 B  186 ms
20000 unclosed <row>  zip 349 B  704 ms
40000 unclosed <row>  zip 494 B 3034 ms   (x4 per doubling)
40000 unclosed <c>    zip 997 B 4148 ms
```
Extrapolated, 400,000 tags take about 5 minutes. The 64 MB cap allows about 12 million.

**Fix.** Replace the regexes with a single forward scan using `indexOf("<row", pos)` and `indexOf("</row>", start)`. If the closing tag is missing, stop or refuse; never retry from the next position. Do the same for `<c>`. Also count `<row` openings and apply a row cap before parsing. Optionally move parsing to a `worker_threads` worker with a time limit.

---

### F5 (Medium): a supplier return puts the cost variance into Trade Payables

**Where:** `src/main/services/inventoryService.js:347-366` (`returnGrniPortion`) and `:394-410`.

**Scenario.** The return is valued at the warehouse's weighted average cost, but the GRNI portion is capped at the receipt value of that supplier's unbilled receipts. Example:
- Supplier 1 delivers 5 units at 100 and is never billed.
- Supplier 2 delivers 5 units at 200 and is billed.
- The average cost is now 150.
- Returning the 5 units to supplier 1 is valued at 750. GRNI is cleared by 500, and **Trade Payables is debited 250**, even though supplier 1 has no bill for this item.

The 250 is a cost variance, not a reduction of a liability. 6fa5734 sent the whole 750 to GRNI and over-cleared it. The new split is closer, but it still lands the variance on a party account.

**Evidence (run).** `/tmp/audit182/t/services.test.mjs`:
```
return voucher lines: [Trade Payables Dr 250, GRNI Dr 500, Inventory Cr 750]
```

**Does the voucher always balance?** Yes, whenever it posts:
- `grniPortion` is `roundMoney(min(r, …))` with `r = roundMoney(retValue)`.
- `payablesPortion = roundMoney(r - grniPortion)` is never negative.
- The credit line is the JS sum of the two debit amounts, each of which has 2 decimals, so `parseMoneyToMinor` gives equal totals.
- The stock ledger row keeps the unrounded `retValue`, as before, so the subledger and GL can differ by sub-paisa amounts.

**Fix.**
- Clear GRNI at receipt cost. Post any gap against average cost to a stock or purchase price variance account (or to Inventory, as a revaluation), not to Trade Payables.
- Debit Trade Payables only up to the value of posted bills for that supplier and item that earlier returns have not already used.
- Add the mixed-cost case to `audit2-regressions`.

---

### F6 (Low): a supplier return worth less than 0.005 can no longer be posted

**Where:** `inventoryService.js:394-410`.

**Scenario.** When `0 < retValue < 0.005`, both portions round to 0. The voucher is built with only the Inventory credit line of 0, and `createBalancedVoucher` throws `At least two voucher lines are required`. At 6fa5734 the same return posted.

**Evidence (run).** 1 unit at rate 0.004 gives `tiny return error: At least two voucher lines are required`.

**Fix.** Guard on `roundMoney(retValue) > 0` instead of `retValue > 0`. Skip the voucher, as the code already does for 0, and still post the stock movement.

---

### F7 (Low): go-live history validation is shallow, and writes are not atomic

**Where:** `goLiveHistoryService.js:10-16, 73-75`.

**Scenarios and evidence (run):**
- **Duplicate IDs.** `{entries:[{id:3}], nextId:1}` passes validation, and the next run gets id 1, then 2, then 3, colliding with the existing entry. `find(id)` then matches the wrong run. Output: `nextId < max id accepted, new id: 1`.
- **Unclear error.** `{entries:[null,5], nextId:1}` passes, then rollback throws `Cannot read properties of null (reading 'id')`. It still fails closed, but the message tells the user nothing.
- **Partial writes.** `writeHistory` uses `writeFileSync` directly. A crash or power loss mid-write leaves a truncated file, and from then on go-live and rollback stay blocked until someone repairs it by hand.
- **Expected and confirmed.** A damaged file is renamed to `*.corrupt-<stamp>`, and later reads stay blocked.

**Fix.**
- Validate that every entry is an object with a positive integer `id`, that the ids are unique, and that `nextId > max(id)`.
- Write to `go-live-history.json.tmp` and rename it over the original, keeping a `.bak` of the previous good copy.
- Have the error message point to the `.bak`.

---

### F8 (Low): smaller gaps in the bank guard

1. **The guard fails open without an actor** (`init.js:1753`, `if (changes.length && actor)`). Every current write path runs inside the synchronous `runAsActor`, and none of the async IPC handlers write records, so I found no live bypass. But a future async handler that calls `createRecord` after an `await`, or a timer job, would skip the rule without any error. Prefer an explicit `internalWrite` context flag for seed and migration code, and deny when neither an actor nor the flag is present.
2. **Delete is audited before the outcome is known** (`crudHelpers.js:430`). A company delete writes `bank_details_changed … deleted` before `assertDeleteSafe` runs. A referenced company is only deactivated, and a blocked delete throws, but in both cases the audit row says it was deleted. Write the audit row after the branch that actually ran, with `deactivated` or `deleted`.
3. **Import rollback deletes companies without the gate** (`importValidationService.js:479-481`). Rolling back a companies import needs only `delete`, and it soft-deletes companies (and their bank details) that an admin may have filled in since. The impact is low, but the gate is inconsistent with `records:delete`.

---

### F9 (Info)

- `bankDetailsPolicy.js:13-18`: the comment says that for banks "changing the account number or IFSC … is what is gated", but `bank_name` and `branch` are gated too. Make the comment and the field list agree. This also feeds F1, scenario 4.
- `QuickCreateMasterDialog.jsx`: the supplier form offers account, bank and IFSC fields to every role. A data-entry user who fills them now gets `Permission denied: settings` at Save. Hide or disable those fields for roles without `settings`. The per-type `duplicateFields` arrays in that file are dead config now that `IDENTITY_RULES` is used; remove them.
- `quickCreateDuplicateGuard.js:17`: the employee rule `["employee_name", "mobile_number"]` is covered by `["mobile_number"]` and never decides anything. The rules are sound otherwise, and because the dialog only warns (Use Existing / Create Anyway), false matches are harmless.
- `browserFallbackApi.js` (preview-only feedback export, around line 1115) builds CSV as `${id},${category},${status},${message}` with no formula guard or quoting. It runs in browser preview only.

---

## Areas checked and found clean

- **Bank-rule bypasses.** I traced every write to `suppliers`, `companies`, `employees` and `banks`:
  - `records:*`, `imports:confirm` (create and update) and quick-create all go through `createRecord` / `updateRecord`.
  - Master Data Tools is checked in main.js before it writes directly.
  - Tally migration is preview-only.
  - Seed and schema writes have no actor.
  - Alias fields (`account_number`, `beneficiary_*`, `ifsc`) cannot get past the check.
  - Master-import `new` rows use database column names, which match `BANK_FIELDS`. `updated` rows use import keys, which match `MASTER_IMPORT_BANK_KEYS`.

  The only gaps are F8.1 (latent) and F8.3.
- **Never-reset guard (the case it is meant for).** It works when the reset's own `catch` wrote the entry. F3 covers the other cases.
- **Supplier-return voucher balance.** It always balances in paise when it posts (F5). Department returns are unchanged.
- **xlsx lazy inflate.** Only `xl/*.xml|rels` parts are listed, and each is inflated on first `get()` with the 64 MB per-part and 128 MB total caps. The cache keys always start with `xl/`, so `in cache` never collides with prototype names. The XFD cap is correct for a 0-based index (16383). The cell cap and the spread cap trigger as intended. F4 is the remaining hole.
- **CSV guard.**
  - The main-process exports (Master Data Tools `toCsv`, feedback export) use `domain/csvSafety.js`.
  - The renderer exports (`exportRows` in `formatters.js`, the import error reports in `fileParsers.js` and `spreadsheetExport.js`, the Master Data Tools error report, templates, Tally reports) use `neutralizeFormula` through `csvCell`.
  - xlsx exports use `inlineStr`, so nothing in them can run as a formula.
  - The number exemption `^[+-]?[\d, ]*\.?\d+$` lets only digits, commas, spaces and one point through. Tested: `-2+3` and `=1+1` are prefixed. Only the preview export in F9 is missing the guard.
- **`api/client.js`.**
  - In the desktop app `resolveApi` returns `window.giiGemErp` unchanged, so desktop behaviour cannot change. All 28 names in `desktopOnlyActions` exist in `preload.cjs`.
  - In browser preview, I scanned every `api.X(` / `apiClient.X(` call site in the renderer. Each method is either provided by the fallback, on the blocked list or on the desktop-only list, or the call is guarded by an existence check: `onConfirmClose`, `getBankLedgers`, `getAlertSettings`, `getEnvironmentInfo`, `getVerificationProfiles`, `getVerificationConsoleState`, `recordVerificationSnapshot`.
  - `SummaryScreen` now receives `api`, which fixes an older undefined-prop crash.
- **Dashboard drilldowns.**
  - The range saved by `handleDrillDown` (instants from `toISOString`) is turned back into local dates by the same `dashboardFilters` / `formatDashboardFilterDate` the dashboard uses, so IST midnight boundaries match the card.
  - Trial balance, GST, unposted, stock and orders use the same backend sources and date filters as `dashboardService` (`financialControlReport` is dated; unposted comes from `postingControlReport` on both sides).
  - Billing, collections and profit filter undated invoice lists on the client with the same range.
  - The company label comes from the live `companyContext`. In all-companies scope the drilldown views are replaced by `AllCompaniesReadOnlyScreen`, so a wrong company is never shown.
  - Receivables and treasury are point-in-time views and are correctly left undated.
- **`will-navigate`.** In production it allows only the exact `dist/index.html` (hash and query ignored); in dev it allows only the dev origin. Bad URLs are caught. The renderer never navigates itself.
- **Treasury split.** Cash is now identified by payment mode, not by a missing bank id. Rows for a bank id not in the bank master and rows with no bank get their own buckets, so balances are no longer lost or merged.

## Scratch files

- `/tmp/audit182/t/bank-forms.test.mjs`: F1, through the IPC handlers (`node --import ./scripts/audit/lib/electron-register.mjs --test …`)
- `/tmp/audit182/t/bank-forms-old.test.mjs`: the same test against the 6fa5734 export, `/tmp/audit182/old`
- `/tmp/audit182/t/services.test.mjs`: F2, F3, F5, F6, F7
- `/tmp/audit182/xlsx-redos.mjs`: F4
- `/tmp/audit182/integrity.log`: the `npm run test:integrity` run
