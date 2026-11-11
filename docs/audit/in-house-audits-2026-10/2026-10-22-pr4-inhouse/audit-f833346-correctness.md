# Correctness audit of commit f833346

- Repo: gii-gem-erp
- Diff reviewed: `git diff 92071b3 f833346`, plus the callers of the changed code (main.js IPC handlers, GoLiveWizard, the import screens, bulk import, Tally migration)
- Date: 2026-10-22
- Scratch work: `/tmp/auditf83-correctness/`
  - `probe-golive2.mjs`: go-live guard with the new `auditIdAtStart`/`companyId` entry fields
  - `ipc-f83.test.mjs`: through IPC, `imports:parse-file` by role, and a full lost-mark rollback after a reset of another company
  - `probe-supplier2.mjs`: supplier aliases, run as admin and as data_entry_operator; it also runs against 92071b3 with `REPO=/tmp/auditf83-correctness/src92`
  - `probe-caps.mjs`, `probe-rows.mjs`, `probe-worst.mjs`, `dos2-f83.mjs`: the import caps
  - `probe-strip.mjs`: the .xls cell tag strip, old against new
  - `sec/`: the 92071b3 security IPC probes, pointed at this checkout
  - `src92/`: a `git archive` of 92071b3, used for comparisons
- The 92071b3 probes in `/tmp/audit92-correctness/` were re-run unchanged.
- The repo was not changed, and `git status` is clean after all runs.

## Overall rating: Low

`npm run test:integrity` passes: 86/86 node tests and 19/19 IPC tests (log: `/tmp/auditf83-correctness/integrity.log`).

Both Medium findings of the 92071b3 correctness audit are fixed, and so is security N2:
- The rollback mark is now this run's own go-live reset.
- The .xls tag strip is linear.
- Wide-header imports are refused quickly.

The other claimed fixes also reproduce. I found no High or Medium regression. The new Low findings:
- The fixed 5,000,000-value cap refuses some real sheets that are under 25 MB and used to parse in about 2 s.
- Empty trailing header cells count against the 500-column cap in CSV, TSV and HTML files, but not in .xlsx files.
- The row cap is checked only after the whole file has been parsed.
- A `null` or `0` sent under an alias still blanks the stored field. Since this commit, the bank text is also left showing the old account number.

| # | Rating | Area | Finding |
|---|--------|------|---------|
| 1 | Low | importParserService `toRecords` | The fixed 5,000,000-value cap (header width × rows) refuses real sheets under 25 MB. 300 columns × 16,667 rows (9.5 MB) is refused; 300 × 30,000 (17 MB) parsed in 2.3 s before |
| 2 | Low | importParserService `toRecords` | Empty trailing header cells count against the 500-column cap in CSV, TSV and HTML .xls files, but not in .xlsx. 300 real columns plus 201 trailing commas are refused |
| 3 | Low | importParserService | The 200,000-row cap is checked after the whole file has been parsed. A 24 MB one-column CSV uses 2.4 GB of heap and blocks for 8.9 s before it is refused |
| 4 | Low | crudHelpers `withStoredFields` | A `null` (or `0`) alias still blanks the stored field. Since this commit, `bank_details` then keeps the old account number |
| 5 | Info | crudHelpers | `{account_name: "X"}` on update is now silently dropped. It no longer renames, but it changes nothing either |
| 6 | Info | main.js `imports:parse-file` | No screen loses a working path. Manager and viewer are now refused at parse, not at preview. CSV and .xls chosen with the in-page file input are parsed in the renderer and skip every main-process cap |
| 7 | Info | goLiveService | Refusals now throw from the guard, so they write no `go_live_rollback` audit row. The legacy flat-mark branch still fails open when no reset row matches |
| 8 | Info | importParserService `parseHtmlTable` | `/<[^<>]*>/` leaves part of the markup when a `<` appears inside an attribute value |
| 9 | Info | tests | The new tests do not cover a manual or other-company reset, the parse-file permission, or a reset that fails atomically |

---

## Verification of the claimed fixes

### 92071b3 correctness audit

| # | Prior finding | Status at f833346 | Evidence |
|---|---|---|---|
| 1 | Medium: `resetAuditIdFor` takes any later reset | **Fixed** | See the list below the table |
| 2 | Medium: the .xls cell strip is quadratic | **Fixed** | `probe-parser.mjs` timing: one cell of 320,000 `<` takes 9 ms (was 70.8 s). `dos2-f83.mjs htmllt 160000`: 5 ms |
| 3 | Low: the lost-mark fallback misses CRAC writes | **Not addressed** (not claimed) | `probe-golive.mjs` L2 is still `ALLOWED`. In the security `rollback.test.mjs` run against f833346, `crac:update` is allowed even with a full mark, and `crac:create` is allowed in fallback mode |
| 4 | Low: `account_name` / `beneficiary_account_name` rename the supplier | **Fixed** | `probe-supplier.mjs` S1 and S2: `supplier_name` is unchanged, and S2 sets only `supplier_account_name`. Security `supplier.test.mjs` as data_entry_operator and accountant gives the same result. See finding 5 for a side effect |
| 5 | Low: prior findings 5 and 6 | **Not addressed** | `executeGoLiveReset`'s catch still calls `updateGoLiveEntry` unguarded. A new-format mark still compares every table |
| 6 | Low: `bank_statement_direct_post_blocked` blocks rollback | **Fixed** | The action is in the read-only list. With a full mark plus that row, `probe-bankblock.mjs` gives `ALLOWED` |
| 7 | Info: field and alias that disagree blank `bank_details` | **Not addressed** | `probe-supplier.mjs` S5 and S6 still give `bank_details: ''` |
| 8 | Info: the legacy branch fails open | **Not addressed**, and the window is now somewhat wider | See finding 7 |
| 9 | Info: parser diffs | Unchanged | `probe-parser.mjs` shows the same four DIFF cases as before |

Evidence for finding 1:
- `probe-golive.mjs` (old-format entries, so the time path): L3 and L5 now stay refused after a later manual reset, and L4 stays "no record of a reset".
- `probe-golive2.mjs` (the new `auditIdAtStart` path):
  - A1: a supplier, then a manual reset of the same company, is refused.
  - A2: a supplier, then a reset of company 2, is refused.
  - A3: a stuck run followed by a manual reset is refused with "no record of a reset".
- `ipc-f83.test.mjs`: a lost mark, then real `executeEnhancedReset`, then data_entry_operator creates a supplier, then company 2 is created and reset, then company 1 gets a manual `reset:execute`. `go-live:rollback` is refused ("companies, suppliers changed"), and the supplier survives.

### Audit row inside the reset transaction

**Correct.**
- `probe-golive2.mjs` A8: the returned `auditId` is the `go_live_preparation` row, with `company_id = 1`, and it is `MAX(id)`.
- A6: a temporary trigger makes the audit insert fail. The reset throws, no reset row is written, and supplier, procurement, order and invoice counts are unchanged.
- `foreign_keys` is back on afterwards, and the rollback guard says "no record of a reset". `last_insert_rowid()` is still read on the same connection and inside the transaction. The hash-chain `UPDATE` inside `auditLog` does not change it.
- `auditLog`'s company and user existence checks still pass inside the transaction, because the reset keeps the masters.

### `auditIdAtStart` / `companyId`

**Correct for every path that writes them.**
- `executeGoLiveReset` records both before the reset. The query takes the first `go_live_preparation` row with `id > auditIdAtStart`, filtered by company.
- A4: a string `companyId` is coerced by `Number()`, so the row is still found.
- A5: a string `auditIdAtStart` fails `Number.isInteger` and falls back to the time path. That path is now also filtered by module and company and takes the first row. The result is still `ALLOWED`, which is correct.
- Only `executeEnhancedReset` writes `go_live_preparation`. It has done so since e813249, so legacy flat marks (182b11f to 61dfe2b) also match.

### Shared `rollbackRefusalReason`

**Correct.**
- A7: a completed run with no mark now gets "is completed", not "no record of a reset". An unknown id and the string id `"3"` both get "not found", so the guard now fails closed. Through IPC, `go-live:rollback {goLiveId: 99999}` is refused.
- `failGoLiveWithRollback` runs the same check again under `withDatabaseClosed`.
- In GoLiveWizard step 8 (auto-rollback), a refusal now reaches `handleError(err)` with the real message. Before, it showed "Rollback failed: Production verification failed", so this is an improvement. See finding 7 for the audit-row side effect.

### `SUPPLIER_UPDATE_ALIASES`

**Correct for the reported cases.**
- `beneficiary_account_name` sets only the account name.
- `{branch: ""}` and `{branch: "   "}` keep the stored branch. At 92071b3, `"   "` was stored and written into the bank text.
- `{beneficiary_account_name: ""}` now keeps the stored value. At 92071b3 it threw "supplier name is required".
- The bank-detail gate still refuses data_entry_operator for `{bank_name: "SBI"}` and for `{account_number: null}`.
- See findings 4 and 5 for what remains.

### Import caps

**They stop the DoS.**
- `dos2-f83.mjs`: an xlsx with 16,384 columns × 4,000 rows is refused in 84 ms (was 28 s), and a CSV with 65,536 columns in 30 ms.
- `sec/dos-ipc.test.mjs`: through IPC as data_entry_operator, 82 KB is refused in 84 ms (was 11.6 s with 0 timer ticks).
- The worst case accepted at the cap is about 1.2 to 1.6 s: xlsx 500 × 9,000, CSV 500 × 10,000.
- See findings 1 to 3 for refusals of real sheets.

### `imports:parse-file` permission

**Correct.** `ipc-f83.test.mjs`, with a file picked through the stubbed dialog:

| Caller | Result |
|---|---|
| viewer | `Permission denied: import` |
| manager | `Permission denied: import` |
| data_entry_operator | parses |
| accountant | parses |
| signed out | "You are not signed in" |

The resulting `permission_denied` row is in the read-only list, so it does not block a rollback. See finding 6 for which screens call this.

### Other claims

- **environment-config.json:** untracked and ignored (`git check-ignore` matches `.gitignore:50`).
- **Integrity run:** leaves `git status` clean.
- **Dev setting on pull:** a developer's local `environment-config.json` is deleted when they pull this commit, and `readEnvironmentConfig` falls back to Development/Development. This only affects dev and is harmless.

### Items from the security and architecture audits not addressed (not claimed)

- Security N3 / correctness 3: CRAC writes.
- Security N4 / correctness 7: a field and its alias that disagree.
- Security N5: untrimmed bank values. `supplier.test.mjs` still stores `" 111122223333 "` for data_entry_operator.
- Architecture M2: actor mechanisms.
- Architecture M3 parts 3 and 4: the derived keep-omitted set and `supplierFields.js`.
- Architecture L5: `</td >`, damaged-file errors and HTML tests.
- Architecture M1 part 4: the guard is still called from main.js rather than inside the service. The order is now right, though.

---

## 1. Low: the 5,000,000-value cap refuses real sheets under the 25 MB file cap

**Code:** `importParserService.js` `toRecords`, where the second test is `headerEntries.length * rows.length > MAX_IMPORT_VALUES`.

The cap multiplies the **header** width by the row count. It does not count the cells actually present. With 300 columns, anything above 16,666 data rows is refused, however short the rows are.

**Repro:** `node /tmp/auditf83-correctness/probe-caps.mjs`

| Input | f833346 | Before (61dfe2b parser) |
|---|---|---|
| CSV 300 cols × 16,666 rows, 9.5 MB | 16,666 rows in 1.3 s | |
| CSV 300 cols × 16,667 rows, 9.5 MB | **refused** ("16667 rows of 300 columns… Split it") | |
| CSV 300 cols × 30,000 rows, 17.2 MB | **refused** | 30,000 rows in 2.3 s |
| CSV with a 300-column header and 20,000 three-cell rows, 0.12 MB | **refused** | |
| Tab-separated .xls 300 × 17,000, 9.7 MB | **refused** | |

A 300-column GeM export passes the 500-column cap. The row limit is the problem: it is 16,666 at 300 columns and 10,000 at 500. The refusal message is guided ("split it into smaller files"), so the user has a workaround. For a single seller's order history this is rarely reached, hence Low.

For .xlsx the existing `MAX_XLSX_CELLS` (2,000,000 non-empty cells) already binds first on dense sheets. So the new cap mostly bites on CSV and TSV files, and on sparse wide .xlsx sheets.

**Fix:** count the cells actually present (`sum(min(row.length, width))`), or raise the cap to what the 25 MB file cap allows, about 15–20 M values. The cost is about 0.15 s per million values, so 20 M values is about 3 s. Better still, move parsing off the main thread, as security N2 suggested. Add a 300-column × 20,000-row case to the tests as an accepted file.

## 2. Low: empty trailing header cells count against the column cap, in CSV, TSV and HTML only

**Code:** `parseCsv`, `parseDelimited` and `parseHtmlTable` pass every header cell, empty ones included, to `toRecords`. `parseXlsx` filters out empty headers first.

Excel's "Save as CSV" writes the whole used range. A sheet whose formatting or stray cells reach past column SF (501) therefore gets trailing commas on every line. The same sheet saved as .xlsx imports fine.

**Repro:** `probe-caps.mjs`.
- 300 named columns plus 199 empty header cells: 100 rows, accepted.
- 300 named columns plus 201 empty header cells: refused, "the header row has 501 columns; the limit is 500".
- A file with only `a,b` and 600 trailing commas: refused, "602 columns".

The message ("Delete the unused columns") is guided, but it reports columns the user cannot see.

**Fix:** drop the empty headers before the cap in all four parsers, as the xlsx path already does. The empty-string key that CSV rows carry today is unused, so dropping it is safe. Count only the named columns for the cap and for the values product.

## 3. Low: the row cap is applied only after the whole file has been parsed

**Code:** `parseCsv` and `parseDelimited` build every row array, and `toRecords` checks `rows.length` afterwards. The 200,000-row cap never limits the parse itself.

**Repro:** `node --max-old-space-size=4096 probe-rows.mjs /home/claude/gii-gem-erp N`, with a CSV of a header plus N lines of `a`:

| N | File size | Result |
|---|---|---|
| 1 M | 2 MB | refused after 297 ms, 193 MB heap |
| 6 M | 12 MB | refused after 1.9 s, 1.16 GB heap |
| 12.5 M | 24 MB | refused after **8.9 s**, **2.36 GB** heap |

The 12.5 M case is under the 25 MB file cap. With the default 2 GB node heap it crashes with `FATAL ERROR: … heap out of memory` (`probe-worst.mjs`). Electron's main process caps the V8 heap at about 4 GB, so there it survives, but it freezes every window for about 9 s and takes 2.4 GB of RAM. It is reachable through Browse plus `imports:parse-file`, or through `imports:parse-buffer`, by any import role.

This is not new: 92071b3 parsed the same file and returned 3 M rows in 1.9 s. But the commit adds a row cap that does not prevent this case.

For HTML .xls, a 24 MB single row of `<td>a</td>` takes 5.5 s before the column refusal. 4 M `<tr>` take 5.5 s. Both are linear (`probe-parser.mjs`, `probe-worst.mjs`).

**Fix:** count rows inside the parse loops and throw as soon as row MAX+1 is reached. For HTML, stop collecting header cells once there are more than MAX_IMPORT_COLUMNS.

## 4. Low: a `null` or `0` alias still blanks the stored field; since this commit the bank text keeps the old number

**Code:** `withStoredFields`. The delete test uses `String(payload[alias]).trim()`, where `String(null)` is `"null"`, which is truthy, and `String(0)` is `"0"`. The `partChanged` test uses `String(payload[alias] ?? "").trim()`, which is empty for `null`. Then `normalizePayloadForTable` fills the field with `aliases.map(...).find(Boolean) || ""`, and `null` and `0` both become `""`.

**Repro:** `node /tmp/auditf83-correctness/probe-supplier2.mjs` as admin. The stored values are account number `000000000002`, branch Mumbai, and bank text "HDFC - 000000000002 (verified by phone)".

| Payload | f833346 | 92071b3 (`REPO=…/src92`) |
|---|---|---|
| `{account_number: null}` | account number `""`, `bank_details` **still "HDFC - 000000000002 (verified by phone)"** | account number `""`, `bank_details` rebuilt as "Account Number: -" |
| `{branch: null}` | branch `""`, old text kept | branch `""`, text rebuilt |
| `{contact: null}` | contact `""` | contact `""` |
| `{account_number: 0}` | account number `""`, text rebuilt as "Account Number: -" | same |

At f833346 the bank text shows an account number that is no longer stored. The commit message says "a blank alias keeps the stored value", and that does not hold for `null`.
- data_entry_operator is refused (`{account_number: null}` gives "Permission denied: settings").
- No screen sends `null` under an alias.
- So this needs an admin sending a direct IPC payload, hence Low.

**Fix:** use one test in both places, for example `const given = (alias) => sent(alias) && payload[alias] !== null && String(payload[alias]).trim() !== ""`. Alternatively, apply the update aliases yourself (`stored[field] = payload[alias]`) and then delete the alias key, so that `normalizePayloadForTable`'s `||=`/`find(Boolean)` (which also drops `0`) is never asked to fill the field.

## 5. Info: `account_name` on update is now silently ignored

`account_name` is an alias only of `supplier_name` in `SUPPLIER_FIELD_ALIASES`, and it is not in `SUPPLIER_UPDATE_ALIASES` at all.

`probe-supplier2.mjs` N5: as admin, `{account_name: "X"}` gives no change to any column, and the call succeeds. At 92071b3 the supplier was renamed to the stored account name. The data is safer now, but a caller that meant to set the account name gets success and nothing changes.

N11: `{supplier_name: "", account_name: "Alias Name"}` sets the name to the **stored** account name, not to the alias sent. This was already the case at 92071b3.

**Fix:** map `account_name` to `supplier_account_name` in the update map, which is what architecture M3 proposed. Otherwise, reject unknown alias keys on update.

## 6. Info: `imports:parse-file` permission: who calls it

Callers:
- `AddRecordPanel` (Browse);
- `BankStatementScreen` (Browse, and `parseUploadFile` when `file.path` is set);
- both `MasterImportTemplatesScreen`s;
- `importParsers.js`/`fileParsers.js` `parseUploadFile`.

Every one of them leads to a call that already needed `import`: `imports:confirm` (including the dry-run preview), `bank:create-import`, or `master-data:preview-update`/`confirm-update`. Tally migration goes through `guarded("import")`.

So no role loses a flow it could finish before. Manager (it has `approve` for bank statements) and viewer are now stopped at parse rather than at preview, with a guided message.

Related, not new: the app runs on Electron ^37, and `File.path` was removed in Electron 32. So in `parseUploadFile`, `file.path` is always undefined for the in-page `<input type=file>`. CSV and .xls picked that way are parsed in the renderer (`parseCsvText`/`parseLegacyXlsText`), with no permission check and none of the new caps. Only .xlsx goes to `parse-buffer`. A renderer freeze is less severe than a main-process freeze, but the caps are inconsistent. One example: the 30,000-row CSV from finding 1 is refused through Browse and accepted through the file input.

## 7. Info: go-live guard side effects

- **No audit row for refusals.** For an unknown or completed run, `assertGoLiveRollbackSafe` now throws first. `main.js` therefore never reaches the `go_live_rollback` audit write, which before recorded `success: false` for these refusals. Guard refusals were already unaudited. Consider auditing refusals in the handler.
- **Legacy flat-mark branch fails open.** When `resetAuditIdFor` finds no row, the branch still skips the audit check silently. With the new module and company filter, a synthetic legacy entry backed by a manual `reset:execute` row now fails open (security `legacy.test.mjs`: "legacy, after supplier create" is `allowed`; at 92071b3 it was refused). Real legacy entries come from 182b11f to 61dfe2b, which always wrote `go_live_preparation` with the company id, and `probe-golive.mjs` L5 still refuses. So this is theoretical. Refusing when the row is missing, as the lost-mark branch does, would remove it.

## 8. Info: the tag strip and `<` inside attributes

`probe-strip.mjs`, new parser against 92071b3:

| Cell | f833346 | 92071b3 |
|---|---|---|
| `<span title="a<b">Name</span>` | `<span title="a Name` | `Name` |
| `a<b<c>d` | `a<b d` | `a d` |
| `x < y`, `Price <5 & >2`, and normal font, br and comment markup | identical | identical |

Excel and GeM HTML exports escape `<` in attributes as `&lt;`, so this is unlikely to occur. A tag walker that respects quotes would make it exact.

## 9. Info: test coverage of the new paths

Covered:
- A second `go_live_preparation` reset row after work.
- `beneficiary_account_name` and `{branch: ""}`.
- A 20,000-column CSV.
- 160,000 `<` in an .xls cell.

Not covered:
- A later **manual** reset (`module = 'operational_reset'`) or a reset of **another company**. These are the scenarios from the 92071b3 report. `probe-golive2.mjs` A1–A3 and `ipc-f83.test.mjs` show they are handled.
- A reset whose audit insert fails, leaving the books unchanged (A6).
- The `imports:parse-file` role check.
- The status-message ordering for a completed run (A7).
- A large real-shaped sheet that must still import (findings 1 and 2).
- `null` aliases (finding 4).

The wide-header test asserts that it takes under 2 s on wall-clock time. That is generous: the measured time is about 30 ms. It could still flake on a heavily loaded CI machine.

## Other checks that passed

- **Rollback through IPC after real resets** (`ipc-f83.test.mjs`): refused, and the data survives.
- **Security probes against f833346:**
  - `probe3.test.mjs`: no mark gives "no record of a reset", and a string id gives "not found".
  - `rollback.test.mjs` test A now stays refused after a reset of company 2. Its stand-in "go-live reset" is a manual `reset:execute`, so it now fails closed with "no record of a reset".
  - Viewer activity still does not block a rollback.
- **Bank gate:** every `supplier.test.mjs` data_entry_operator bypass attempt is still refused, or allowed only when no gated value changes.
- **Parser equivalence:** `probe-parser.mjs` shows the same results as at 92071b3 for every case except the cell strip.
