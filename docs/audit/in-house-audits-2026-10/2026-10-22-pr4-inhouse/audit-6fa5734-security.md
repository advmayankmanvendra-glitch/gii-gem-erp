# Security audit of commit 6fa5734 (fixes for F1-F13)

Branch `claude/erp-full-automation-qbhv8k` @ `6fa5734` (committed 22 Oct 2026, 22:26 IST). Auditor: in-house security pass (Claude), 23 Oct 2026, about 03:10 IST. Read-only, with no repository edits.

**How it was run:** probes drove the real `src/main/main.js` handlers through the repo's Electron stub (`node --import ./scripts/audit/lib/electron-register.mjs`), with a throwaway data root. Probe script: `/tmp/audit-6fa5734/probe.mjs`; results: `/tmp/audit-6fa5734/probe-out.json`. The repo's `scripts/audit/ipc-security.test.mjs` passes 16/16 at this commit.

## Verdict

**Not clean. F1, the merge blocker, is still open in practice.**
- The new bank-details check only looks at the canonical column names in the payload. `normalizePayloadForTable` (`crudHelpers.js:58-67`) still accepts alias keys and maps them onto those columns afterwards.
- So a `data_entry_operator` can redirect a supplier's bank account with a single `records:update` call. Confirmed by running. No `bank_details_changed` audit row is written.
- New suppliers and companies, and every employee bank field, are not covered at all.

The other fixes mostly hold:
- **Closed:** session re-validation (F4), feedback author (F10) and the audit:context record-history forgery (F6).
- **Partial:** navigation guard (F3), parse-buffer caps (F7), CSV escaping (F11) and the installer gate (F12).

There is also one new Medium: a 269-byte .xlsx blocks the main process for 40 s.

## Status of F1-F13

| F | Status | Notes |
|---|---|---|
| F1 bank details | **open (partial)** | Canonical-key updates on `suppliers`/`companies` and every write to `banks` are gated. `imports:confirm` update mode (A8) and `master-data:confirm-update` updates (A7b) are gated too, and both were confirmed denied. Bypassed by N1-N4. |
| F2 Electron 37.0.0 | open | `package.json:84` is still `^37.0.0`. |
| F3 navigation / CSP | partial | `will-navigate` and `setWindowOpenHandler` deny were added (`main.js:597-604`). Every `file:` URL is still allowed (N7), and there is still no CSP in `index.html`. The print window uses a `data:` URL with no preload, so it is acceptable. |
| F4 session after restore | **closed** | `sessionUser` (`main.js:274-288`) re-reads `users` on every non-public call, because `handle()` (`main.js:784`) always calls it. It fails closed when `db` is null mid-swap, and the role is taken from the database. Confirmed by the repo test. |
| F5 unkeyed audit chain | open | Not addressed by this commit. |
| F6 audit:context forgery | **closed** (low residual) | Actions are allow-listed and `table_name` is forced to `ui_context`. The voucher history (`init.js:1318`) filters on `table_name='vouchers'`, so forged rows no longer appear there. Residual: `module`, `company_id`, `record_id` and 500 characters of `new_value` are still caller-chosen (N8). |
| F7 xlsx bomb / parse-buffer | partial | The `import` permission, the 25 MB input cap, and the 64 MB per-entry and 128 MB total inflation caps all work: a 60 MB sheet parsed in 2.5 s with +40 MB RSS. New amplification: N5. |
| F8 unguarded reads | open | Not addressed. |
| F9 error-journal flush | open | Not addressed. |
| F10 feedback author | **closed** | The author comes from the session (`main.js:1389-1393`). |
| F11 CSV formula injection | partial | Fixed in `masterDataToolsService.csvCell`, `spreadsheetExport.csvCell` and `fileParsers.csvCell`. Not fixed in the main report exporter or the feedback export (N6). |
| F12 unverified installer | partial | Now needs `settings` and is audit-logged (`main.js:1214-1222`; an admin call passes the gate). There is still no signature or hash check on the `.exe`. |
| F13 lockout DoS | open | Not addressed (`authService.js:93-101`). |

## New findings

### High

**N1. Alias keys bypass the bank-details check on supplier update (F1 still open).**
- **Location:** `src/main/services/bankDetailsPolicy.js:26-29`, `src/main/main.js:1103-1110`, `src/main/database/crudHelpers.js:64-67`.
- **Weakness:** `bankDetailChanges` checks `hasOwnProperty(payload, "supplier_account_number")` and the other canonical keys. `cleanPayload` then runs `normalizePayloadForTable`, which fills `supplier_account_number ||= beneficiary_account_number || account_number`. IFSC, bank name, branch and account name work the same way, and `bank_details` is rebuilt from them.
- **Attack:** A `data_entry_operator` sends `records:update("suppliers", id, {...supplier minus supplier_account_number/supplier_bank_ifsc_code/supplier_bank_name/bank_details, account_number:"999988887777", ifsc:"EVIL0000001", bank_name:"Evil Bank"})`. The `beneficiary_*` keys work too.
- **Evidence:** Confirmed by running (probe A1, A1b).
  - The call succeeded.
  - The stored values became `999988887777 / EVIL0000001 / Evil Bank`, and `bank_details` was regenerated with them.
  - Zero `bank_details_changed` rows were written.
  - With `beneficiary_account_number` the account became `555566667777`.
- **Fix:** Compute the bank diff after normalisation, on what will actually be written. Diff `cleanPayload(table, payload)`, or for an update the normalised merged row, against `oldRecord`. Do not diff the raw payload. Simplest: export `cleanPayload` and normalisation from crudHelpers and call `bankDetailChanges(table, normalizedData, oldRecord)`, so that any key that lands in a bank column counts.

### Medium

**N2. Bank details can be wiped by leaving the field out.**
- **Location:** same as N1; `cleanPayload` sets every missing field to `""` (`crudHelpers.js:88-90`), and `updateRecord` writes every column.
- **Attack:** A `data_entry_operator` sends `records:update("companies", 1, {...company minus bank_name/account_number/ifsc})`.
- **Evidence:** Confirmed by running (A2). The company's `bank_name`, `account_number` and `ifsc` became `""` with no permission check. Suppliers behave the same way.
- **Impact:** Payment details are destroyed. Combined with N3, a DEO can then route payments to a newly created record. A normal UI form that does not include the bank fields would also silently erase them.
- **Fix:** The N1 fix covers it, since the post-normalisation diff sees `"" != old`. Also make `updateRecord` merge onto `oldRecord` rather than blank omitted fields.

**N3. Creating a supplier or company with bank details is not gated, through any channel.**
- **Location:** `main.js:1100`: `bankDetailChanges(table, payload, null)` returns `[]` for suppliers and companies, because of `if (!fields || !oldRecord) return []` (`bankDetailsPolicy.js:26`). `masterImportTouchesBankDetails` ignores `new` rows for non-admin-only masters (`bankDetailsPolicy.js:41`), and the `imports:confirm` create path has no check.
- **Attack:** A DEO creates "Acme Traders (new)", a near-duplicate of a real vendor, carrying the attacker's account, and books bills against it. They can also create a new company with any bank details.
- **Evidence:** Confirmed by running.
  - A3: `records:create suppliers` with account `123123123123` succeeded.
  - A4: `records:create companies` "Shadow Co" succeeded.
  - A7: `master-data:confirm-update` new supplier `SUP-EVIL` with account `313131313131` imported 1 row.
  - A8b: `imports:confirm` new supplier with account `171717171717` created 1 row.
- **Fix:** Treat a non-empty bank field on create as a change. Make `bankDetailChanges(table, data, null)` return the non-empty bank fields, apply it to `new` rows in `masterImportTouchesBankDetails`, and gate `bulkImportRecords` creates. Gate `companies` create with `settings` outright. If DEOs must onboard suppliers, let them create without bank fields, or hold new bank details in a pending state until an admin approves them.

**N4. Employee bank details are not covered.**
- **Location:** `bankDetailsPolicy.js:7-10` has no `employees` key. The `employees` fields `bank_name`, `account_number`, `ifsc` and `branch` are in `init.js:64` and `masterDataToolsService.js:124-127`.
- **Attack:** A DEO redirects an employee's salary or incentive account.
- **Evidence:** Confirmed by running.
  - A5: `records:update employees` changed the account to `777700001111` and the IFSC to `EVIL0000005`.
  - A6: `master-data:confirm-update employees` changed them to `888800002222 / EVIL0000006`.
- **Note:** The original F1 fix text named `employees` explicitly.
- **Fix:** Add `employees: ["bank_name","account_number","ifsc","branch"]` to `BANK_FIELDS`, and the master keys to the check.

**N5. A tiny .xlsx with a huge column letter blocks the main process (F7 bypass).**
- **Location:** `src/main/services/importParserService.js:159-166`.
- **Weakness:**
  - `excelColumnIndex("ZZZZZZ")` is about 3.2e8, and `row[colIndex] = value` creates a sparse array of that length.
  - `row.some(...)` and `row.map(...)` then walk every index.
  - The inflation caps do not help, because the XML is only a few bytes.
  - It is reachable through `imports:parse-buffer` (any role with `import`, DEO included) and `imports:parse-file`, for example from a supplier-sent sheet.
- **Evidence:** Confirmed by running (D1).
  - A 268-byte xlsx with one `ZZZZZZ2` cell took 13.4 s.
  - A 269-byte file with 3 such rows took 39.9 s, which is linear in rows. 100 rows is about 20 minutes of a frozen ERP while it holds the database open.
  - `ZZZZZ` took 0.5 s and +94 MB RSS.
- **Fix:** Reject column references longer than 3 letters or past `XFD` (16384 columns, Excel's limit). Cap rows and cells, for example at 200k cells. Build rows with `push`/fill up to the last used index, capped. The renderer parsers (`fileParsers.js:157`, `importParsers.js:148`) have the same pattern and no inflation cap, but they only freeze the renderer.

**N6. CSV formula injection remains in the main report export and the feedback export (F11 partial).**
- **Locations:**
  - `src/renderer/utils/formatters.js:23-26`: `csvCell` is used by `exportRows`, which accounting, bank reconciliation, voucher proposals, inventory reports, operations and documents call.
  - `src/main/services/feedbackService.js:62-74`.
  - The import error reports at `spreadsheetExport.js:121-123`, `fileParsers.js:376-378` and `MasterDataToolsScreen.jsx:250-253`, which echo row codes and names.
- **Attack:**
  - A viewer submits feedback `=HYPERLINK("http://x","click")`, and an admin's feedback CSV opens it as a live formula.
  - A bank-statement narration or supplier name starting with `=`/`+`/`@` does the same through `exportRows("bank-reconciliation", …)`.
- **Evidence:** Confirmed by running for feedback (probe B). The exported line contains `"=HYPERLINK(""http://x"",""click"")"`, unprefixed. The rest was confirmed by reading.
- **Fix:** Move `neutralizeFormula` into one shared helper and use it in `formatters.csvCell`, in `feedbackService` and in the three error-report builders.

### Low

**N7. The navigation guard allows any `file:` URL.**
- **Location:** `main.js:599-602`.
- **Weakness:** `target.protocol === "file:"` lets the signed-in main window, with its preload API and session, navigate to any local HTML, such as a `.html` attachment in Downloads, through an injected link.
- **Evidence:** By reading.
- **Fix:** Allow only the exact packaged `dist/index.html` path (compare `fileURLToPath(url)`) or the dev origin. Also handle `will-redirect`, and add the CSP meta that F3 asked for.

**N8. audit:context still takes `module`, `company_id`, `record_id` and `new_value` from the screen.**
- **Location:** `main.js:1049-1067`.
- **Evidence:** Confirmed by running (B). A viewer wrote `module:"vouchers", company_id:2, record_id:1, new_value:'{"amount":999999,"note":"edited by accountant"}'`. The row is hidden from per-table history, since `table_name='ui_context'`, but it shows in a full audit-log listing, chained like a genuine row.
- **Fix:** Drop `record_id` and `new_value`, or allow-list a `{screen, view}` shape. Force `module="ui"`, and derive `company_id` from a validated id.

**N9. Bank changes through import and master-data paths are not recorded as `bank_details_changed`.**
- **Location:** `importValidationService.js:411-413`, `main.js:994-997`.
- **Detail:** Only `records:update` writes the explicit old/new bank audit row. On the other paths an admin's import changes bank details with only the generic `update`/`master_data_update` row; `master_data_update` records only a summary.
- **Fix:** Emit `bank_details_changed` with the field diffs in both paths.

## Checked and holding

- **`imports:confirm`:** an update-mode supplier bank change by a DEO is denied (A8). Any `banks`/`companies` table import needs `settings`.
- **`master-data:confirm-update`:** an update to an existing supplier's bank fields by a DEO is denied (A7b), and any `banks` row needs `settings`. The preview is recomputed inside confirm with the same context, so the rows a caller supplies cannot desync it.
- **Tally:** the Tally channels only preview, and commits go through `imports:confirm`/`records:create`. That means Tally inherits N1 and N3, but it has no separate write path. There are no other raw `INSERT`/`UPDATE` writers of `suppliers`, `companies`, `banks` or `employees` in `src/main`.
- **Records:** `records:delete` of `banks`/`companies` needs `settings`.
- **Updates and parse-buffer:** `updates:install` and `imports:parse-buffer` refuse a viewer (repo test). The admin installer path reaches the folder check, so `enforcePermission` returns a user and `installer.id` is valid.
- **Sessions:** a disabled or missing user is signed out on the next call. A username mismatch at the same id clears the session.
