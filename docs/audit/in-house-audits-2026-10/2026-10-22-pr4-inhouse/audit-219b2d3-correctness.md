# Correctness audit of commit 219b2d3

- Repo: gii-gem-erp, HEAD `219b2d3` ("Close the f833346 audit findings")
- Diff reviewed: `git diff f833346 219b2d3` (10 files, +121/-41). I also read the callers of the changed code: `updateRecord`/`createRecord`, `guardBankDetailWrite`, the CRAC and order-closure services, the import screens, master-data tools and the go-live wizard.
- Date: 2026-10-29
- Scratch work is in `/tmp/audit219-correctness/`. `srcf83/` is a `git archive` of f833346, used for before/after runs (`REPO=/tmp/audit219-correctness/srcf83 node <probe>`).
  - `probe-supplier2.mjs`: the f833346 supplier-alias cases N1–N11.
  - `probe-numeric.mjs`: `0`, `false`, blank and whitespace values in columns and aliases. Output is in `num-219.out` and `num-f83.out`.
  - `probe-u10.mjs`: a blank or null column sent with an alias that matches the stored value.
  - `probe-trim.mjs`, `probe-trim2.mjs`: bank-value trimming with no actor, as admin and as data_entry_operator.
  - `probe-caps.mjs [csv|tsv|xlsx]`, `probe-xlsx2.mjs`, `probe-onerow.mjs`, `probe-manyrows-blank.mjs`: the import caps.
  - `probe-golive2.mjs`: the go-live guard. It contains the f833346 cases A1–A8 plus new cases B1–B3. Output is in `golive2-219.out` and `golive2-f83.out`.
  - `ipc-crac.test.mjs`: CRAC handlers called through real IPC. Run it with `cd /home/claude/gii-gem-erp && node --import ./scripts/audit/lib/electron-register.mjs --test /tmp/audit219-correctness/ipc-crac.test.mjs`.
  - The shared-string bomb is `/tmp/auditf83-security/ss.mjs <bytes> <cells>`, which imports the live checkout.
- The repo was not changed. `git status --short` is empty after all runs.

## Overall rating: Low

`npm run test:integrity` passes: 87/87 node tests and 19/19 IPC tests (`/tmp/audit219-correctness/integrity.log`). No rebuild was needed.

Every claimed fix reproduces. I found no High or Medium regression.

The guard change for a lost go-live mark adds one fail-open case (finding 1). It cannot be reached in normal use, because sign-in always writes an audit row first. It does not cause false refusals after a normal go-live: probe B1 checks this.

The other findings are Low or Info edge cases:
- the new `hasValue` rule treats `0` and `false` differently from before;
- the newline-count row cap counts blank lines;
- one form of security N4 remains;
- the composed bank text is not trimmed.

| # | Rating | Area | Finding |
|---|---|---|---|
| 1 | Low | goLiveService lost-mark branch | `auditIdAtStart = 0` becomes `mark.auditId = 0`. `if (mark.auditId)` is then false, so nothing is checked and the rollback is allowed even after live work. At f833346 this case was refused |
| 2 | Low | crudHelpers `hasValue` | `0` now counts as a value and is stored as `"0.0"`, while the bank text still says `Account Number: -`. `false` now throws a raw SQLite bind error. Both used to become `""` |
| 3 | Low | importParserService `parseDelimited` | The row cap counts raw `\n`, blank lines included. A 120,000-row tab .xls with a blank line after each row is refused, and so is a 200,000-row file with a few trailing newlines. Both parsed at f833346 |
| 4 | Low | crudHelpers `withStoredFields` | Security N4 is fixed only in part. A **blank or null** column sent with an alias equal to the stored value still wipes `bank_details` for an admin and refuses a data-entry user |
| 5 | Low | bank trimming | Columns are stored trimmed. The `bank_details` text composed from them is built *before* the trim, and `supplierBankPartsChanged` uses `.trim()`, not the new edge rule. So a zero-width-space account number is trimmed back to the stored value, yet it still rebuilds the bank text with the invisible character inside |
| 6 | Info | crudHelpers normalizer | A whitespace-only `supplier_name` now falls back to the account name, on create and on update, instead of failing with "supplier name is required". An empty `""` already did this on update |
| 7 | Info | CRAC audit rows | Return shapes and record ids are correct. The rows carry `company_id = NULL`, and there is no `old_value` on update or delete |
| 8 | Info | xlsx caps | The 64 Mi-character cap refuses a 4.3 MB real-shaped sheet (60k rows × 20 columns of 60-character repeated text). A header below row 50 is no longer found. The message says "64 million" while the cap is 67,108,864 |
| 9 | Info | import caps (not claimed) | One very wide CSV row is still parsed in full before any check: 24 M commas take 7–10 s and 2.4 GB RSS. This is unchanged from f833346, and with blank headers dropped it is now accepted |
| 10 | Info | GoLiveWizard, tests | A failed rollback shows a doubled prefix ("Rollback failed: Rollback refused: …"). The lost-mark test still writes the reset row by hand rather than by running `executeEnhancedReset` |

---

## Verification of the claimed fixes

| Claim (commit message) | Prior finding | Status | Evidence |
|---|---|---|---|
| XLSX cell over 32,767 characters refused; sheet over 64 M characters refused | Security N7 (Medium) | **Fixed** | `ss.mjs 10000000 2000`: 121 ms, refused (was 26 s). `ss.mjs 32767 100000`: 32 ms, refused. The worst accepted case, `32767 × 2048` cells, takes 14 ms with about 5 MB of heap |
| Header looked for in the first 50 rows only | — | **Works** | It cuts the scan cost. See finding 8 for a sheet whose header is below row 50 |
| Blank header cells do not count | Correctness 2 | **Fixed** | `probe-caps.mjs csv`: 300 named columns plus 250 blank ones gives 300 keys. 500 named plus 1 blank is accepted, and 501 named is refused. A blank header in the middle (`name,,amount`) gives `{name, amount}` |
| Value cap raised to 12 M; 300 × 30,000 imports | Correctness 1 | **Fixed** | 300 × 30,000 (18 MB): accepted in 2.2 s. 300 × 40,000 (12 M values, 24 MB): accepted in 3.6 s. 300 × 40,001: refused. 500 × 24,000: accepted in 3.7 s. A CSV with non-empty cells is limited by the 25 MB byte cap before it reaches 12 M values |
| Row cap checked while reading CSV, tab and HTML | Correctness 3 / security N8 | **Fixed for rows** | A 24.8 MB CSV of 12.4 M one-column lines is refused in 95 ms with 69 MB of heap (was 8.9 s and 2.4 GB). The 200,000/200,001 boundary is exact for CSV and HTML. See finding 3 for TSV and finding 9 for a single wide row |
| Lost-mark rollback counts from the run's start; module name is one constant | Security N6 / arch M1(1) | **Fixed** | The suite test "work entered, then a separate Enhanced Reset" passes. Probe A1–A3 still refuse. B1: a normal go-live, then `rebuildZeroState`, then `verifyGoLiveProduction`, then login/ui/permission_denied rows: **ALLOWED** (no false refusal). Between `auditIdAtStart` and the reset row a real reset writes **no** audit rows, so the extra window holds nothing in normal runs. `GO_LIVE_RESET_MODULE` is used in both files. See finding 1 |
| Supplier updates: one "has a value" rule; a null alias keeps the stored value | Correctness 4 / arch M3 | **Fixed** | `probe-supplier2.mjs` N1–N3: `{account_number:null}`, `{branch:null}` and `{contact:null}` now leave every column **and** `bank_details` unchanged. At f833346 they blanked the column and left the bank text stale |
| The column wins over a disagreeing alias | Security N4 | **Fixed for a non-blank column** | `probe-numeric.mjs` U9: `{supplier_account_number: stored, account_number:'999'}` keeps the number and the bank text (at f833346 `bank_details` became `''`). See finding 4 for a blank column |
| Update alias map derived from the create map | Arch M3(2) | **Fixed** | `SUPPLIER_UPDATE_ALIASES` is the create map without `supplier_name`, and its entries are identical to the old hand-typed map. The misplaced comment now sits above `SUPPLIER_BANK_PARTS` |
| Bank values stored trimmed, using the bank check's rule | Security N5 | **Fixed for the columns** | `probe-trim.mjs` stores `" 000000000002 "`, `"… "` and NBSP-padded branch as trimmed values, for no actor, admin and data_entry_operator. At f833346 they were stored as sent. `probe-trim2.mjs`: banks and employees with no actor are trimmed too. See finding 5 |
| CRAC create/update/delete and order closure write audit rows | Security N3 / correctness 3 (92071b3) | **Fixed** | `ipc-crac.test.mjs` through IPC: create gives `crac_created` with `record_id=1`; update with a **string** id gives `crac_updated` with `record_id=1`; delete gives `crac_deleted`. A refused update (unknown id) or a closure-mark that is not ready writes no row. Against a full go-live mark, the rollback is then refused: "crac records changed". See finding 7 |
| Go-Live wizard shows the rollback's own reason | Arch M1(3) | **Fixed** | `rollbackResult.reason || rollback.reason` (finding 10 is cosmetic) |
| Ignore `/config/` and `database/*.json` | Arch L7 | **Fixed** | `git check-ignore` matches `config/alerts.json` and `database/pending_restore.json`. Both patterns are anchored, so `src/main/config/*` and `src/renderer/config/*` stay tracked, and no tracked file is newly ignored |

The f833346 items that are still not addressed, and were not claimed: arch M2 (two actor mechanisms), the legacy flat-mark fail-open (B3 still allows), the in-renderer CSV/.xls parse that skips the main caps, and the `<` inside attributes. None of them changed.

---

## Regression checks requested

### `hasValue` in the supplier normalizer: 0 and false

Callers of `normalizePayloadForTable("suppliers")` are only `cleanPayload` and `supplierBankPartsChanged`, and both run inside `crudHelpers`. All renderer supplier fields are `text` inputs, and every parser returns strings. So `0` and `false` arrive only through direct IPC or a hand-built payload. The behaviour did change, though. See finding 2.

Whitespace-only values now count as "no value". An alias then fills them: U7 `{supplier_branch:'   ', branch:'Pune'}` stores `Pune`, where f833346 stored `'   '`. That is an improvement, but see finding 6 for the supplier name.

### Blank header columns dropped

No consumer reads an empty-string key:
- `grep '[""]'` over `src` finds nothing.
- Consumers use `Object.keys(rows[0])` for display or mapping: AddRecordPanel, both MasterImportTemplatesScreens and BankStatementScreen.
- The bank column-mapping `<select>` uses `""` to mean "Auto / Not mapped", so an empty-named column could never have been mapped anyway.
- The Tally migration reads rows by named keys.

At f833346 the only effect of the `""` key was a phantom "column" in the detected list, and duplicate blank headers collapsed into it. **No regression.**

### New import caps: do they refuse real files?

- CSV and HTML: no. Any CSV with real cell content reaches the 25 MB byte cap before the 12 M value cap.
- TSV: blank lines count against the row cap (finding 3).
- xlsx: the character cap can refuse a dense text sheet that is still small on disk (finding 8). That needs about 1.1 M cells averaging more than 60 characters, which is unusual for GeM or Tally sheets.
- The 32,767-character cell cap matches Excel. A non-Excel generator could write longer cells, but Excel itself would truncate them.

### Bank-value trimming inside the guard, for rows written with no actor

`trimBankFields` runs before the actor check, so rows written with no actor (seed, migrations, internal writes) are trimmed too (`probe-trim.mjs` "noactor", `probe-trim2.mjs`). This is harmless:
- Nothing looks up a bank record by account number or IFSC: a grep for `account_number = ?` and `ifsc = ?` finds nothing.
- `bankDetailChanges` already compared trimmed values, so the gate decision is the same.
- Only strings are touched, and the delete path passes `row = null`, which is guarded.

Side effects:
- A legacy padded value is silently normalised on the next unrelated edit. It writes no `bank_details` audit row, because the trimmed values compare equal (Info).
- Master-data tools write with their own SQL and use `.trim()`, which misses U+200B–U+200D. The "stored trimmed" rule therefore does not cover that path for zero-width characters (Info).
- The composed bank text is not trimmed (finding 5).

### CRAC audit wrappers in main.js

Return shapes are unchanged:
- `createCracRecord` and `updateCracRecord` return the row, and `auditCrac` passes it through (19 keys, same id).
- `deleteCracRecord` and `markOrderOperationallyClosed` return `undefined` before and after.

Record ids:
- On create, `result.id` is used.
- On update and delete, `Number(id)` is used, so a string id is fine.
- On closure, `Number(orderId)` is used.

A service that throws writes no audit row, which is correct. The audit insert runs after the write and outside a transaction. `auditLog` already tolerates missing users and companies, so in practice it does not throw, and a throw would report an error for a write that was saved (Info). See finding 7 for the missing `company_id`.

### Go-live: where the lost-mark count starts

There are no false refusals after a normal go-live:
- `executeGoLiveReset` records `auditIdAtStart` after the backup and then calls the reset synchronously, so nothing can interleave.
- Inside the reset only the reset row itself is written (B1: zero rows between them).
- Every row after the reset row was already counted at f833346.
- B1, with zero state, verify and viewer-type rows: **ALLOWED**. The suite test "can still be rolled back" also allows a clean run.

The only new hole is finding 1.

---

## 1. Low: `auditIdAtStart = 0` disables the lost-mark check

**Code:** `goLiveService.js` `assertGoLiveRollbackSafe`:

```js
mark = { tables: {}, auditId: Number.isInteger(entry.auditIdAtStart) ? entry.auditIdAtStart : reset };
compared = [];
...
if (mark.auditId) { /* audit-row check */ }
```

When the audit log was empty at the start, `auditIdAtStart` is `0`. That is an integer, so it is used, and then `if (0)` skips the only check this branch has, because `compared` is empty. At f833346 the mark was the reset row's id, which is always 1 or more.

**Repro:** `node /tmp/audit219-correctness/probe-golive2.mjs`, case B2. It empties `audit_log`, records the run, runs `executeEnhancedReset`, creates a supplier and renames the company:
- 219b2d3: `ALLOWED`
- f833346 (`REPO=…/srcf83`): `refused: companies, suppliers changed after go-live`

**Reach:** go-live needs a signed-in admin, and `auth:login` writes `login_success`. Nothing in `src/main` deletes audit rows. So `MAX(id)` is at least 1 in real use. This is a latent fail-open, not a live one.

**Fix:** `if (mark.auditId != null)`, or keep `auditId: Number.isInteger(entry.auditIdAtStart) ? entry.auditIdAtStart : reset` and test with `Number.isInteger(mark.auditId)`. Add B2 as a test.

## 2. Low: `0` and `false` under the new `hasValue`

**Code:** `crudHelpers.js:50`. `hasValue(0)` and `hasValue(false)` are both true, because `String(false)` is `"false"`. The old `||=`/`find(Boolean)` turned both into `""`.

**Repro:** `node /tmp/audit219-correctness/probe-numeric.mjs` as admin. Compare with `REPO=…/srcf83`:

| Payload | 219b2d3 | f833346 |
|---|---|---|
| `{supplier_account_number: 0}` or `{account_number: 0}` | account number **`"0.0"`**; `bank_details` "…Account Number: **-**…" | `""`; "Account Number: -" |
| create `{supplier_code: 0}` | `supplier_code = "0.0"` | `""` |
| `{account_number: false}`, `{contact: false}`, create `{contact: false}` | **throws** "SQLite3 can only bind numbers, strings, bigints, buffers, and null" | stored `""` |

The cause of `"0.0"`: better-sqlite3 binds a JS number as REAL, and the TEXT column stores it as `"0.0"`. Non-zero numbers were already stored this way (U3 gives `"123456789012.0"`), so the commit extends a known quirk to `0`. The bank text and the column then disagree, because the composer uses `|| "-"`.

**Reach:** no screen sends numbers or booleans for these fields, so this needs direct IPC. A data-entry user is still refused for the bank fields.

**Fix:** coerce supplier text fields with `String(value).trim()` once in the normalizer, and treat `false` as no value. Or reject values that are not strings with a guided message.

## 3. Low: the TSV row cap counts blank lines

**Code:** `parseDelimited`: `if ((text.match(/\n/g)?.length || 0) > MAX_IMPORT_ROWS + 1) throw tooManyRows();`. Blank lines are counted, although the next line filters them out.

**Repro:** `node /tmp/audit219-correctness/probe-caps.mjs tsv`

| File (tab-separated .xls) | 219b2d3 | f833346 |
|---|---|---|
| 200,000 rows | accepted | accepted |
| 200,000 rows + 5 trailing newlines | **refused** "more than 2,00,000 rows" | accepted |
| 120,000 rows, blank line after each (1.7 MB) | **refused** | accepted |

The message tells a user with 120,000 rows that they have more than 200,000.

**Fix:** count non-empty rows while splitting, the same way `parseCsv` does. Or apply the cap after the `filter`, which is cheap at this point since the byte cap already bounds the text.

## 4. Low: security N4 remains for a blank or null column

**Code:** `withStoredFields` treats any sent column, `""` and `null` included, as "the column wins" for `partChanged`. The normalizer treats the same blank column as "no value" and takes the alias. The two disagree.

**Repro:** `node /tmp/audit219-correctness/probe-u10.mjs` (f833346 behaves the same):

| Payload | admin | data_entry_operator |
|---|---|---|
| `{supplier_account_number: "", account_number: <stored>}` | number unchanged, **`bank_details` = ""** | refused, "Permission denied: settings" |
| `{supplier_branch: "", branch: "Mumbai"}` (stored Mumbai) | `bank_details` = "" | refused |
| `{supplier_account_number: null, account_number: <stored>}` | `bank_details` = "" | refused |

The renderer import normalizer fills the column from the alias before sending, so the import screens do not produce this shape. Direct IPC, or a main-process caller with both keys, still does.

**Fix:** in `partChanged`, use `sent(field) && hasValue(payload[field])` to decide that the column wins, which is the normalizer's rule. Otherwise compare the alias.

## 5. Low: the composed bank text is not covered by the trim

**Code:** `cleanPayload` composes `bank_details` from the untrimmed parts. Only then does `guardBankDetailWrite` trim the columns. `supplierBankPartsChanged` decides with `.trim()`, which does not remove U+200B–U+200D.

**Repro:** `node /tmp/audit219-correctness/probe-trim.mjs`:
- Update `{supplier_account_number: "​000000000002"}`:
  - as admin, the column stays `000000000002`, but `bank_details` "HDFC - 000000000002 (verified by phone)" is **rebuilt** as "…Account Number: ​000000000002…";
  - as data_entry_operator, the call is refused although the account number is the same.
- Create `{supplier_name:"Pad Supp", account_number:" 77 ", ifsc:"﻿IFSC1"}`: the columns are `77` and `IFSC1`, but `bank_details` is "Account Number:  77 ; … IFSC: ﻿IFSC1".

This is not new: f833346 rebuilt the text the same way. But the commit's claim ("the same rule the bank check compares with") does not cover the text.

**Fix:** trim the bank parts before composing. For example, call `trimBankFields` in `normalizePayloadForTable`, or export the edge-trim and use it in `supplierBankPartsChanged`.

## 6. Info: a whitespace-only supplier name falls back to the account name

`probe-numeric.mjs`:
- U11: `{supplier_name:"  "}` renames the supplier to the stored account name "PRIME A/C". At f833346 this threw "supplier name is required".
- C1: create `{supplier_name:"  ", supplier_account_name:"ACME A/C"}` creates "ACME A/C". At f833346 it threw.

An empty `""` on update already behaved this way (f833346 N11), so this only extends that case. A user who clears the name in an edit form still gets a silent rename instead of a required-field error. Consider refusing a blank `supplier_name` on update when it was sent explicitly.

## 7. Info: what the CRAC audit rows contain

From `ipc-crac.test.mjs`:
- `company_id` is `NULL` on all four actions, although the CRAC row and the order both carry `company_id = 1`. The company audit view uses `COALESCE(company_id, ?) = ?`, so these rows appear under every company.
- Update and delete carry no `old_value`. Delete and closure have `new_value = "null"`.
- A CRAC update to `Generated` also rewrites `supply_orders`, which is not logged under that table. The rollback guard still refuses through `crac_records`, so the guard is correct.

**Fix:** pass `company_id: result?.company_id ?? existing.company_id`, plus the old row.

## 8. Info: xlsx character cap and header search

`probe-xlsx2.mjs`:
- A 4.3 MB xlsx, 60,000 rows × 20 columns of 200 distinct 60-character strings, is **refused** ("more than 64 million characters"). With 50-character strings it is accepted in 1 s.
- The cap is `64 * 1024 * 1024` = 67,108,864, while the message says "64 million".

`probe-caps.mjs xlsx`: with 60 preamble rows before a `Supplier Name` header, the header is no longer found. Row 1 of the preamble becomes the header, giving `{preamble_0: "Supplier Name"}`.

Both cases are rare for real exports.

## 9. Info: one very wide row is still parsed in full (not claimed)

`probe-onerow.mjs`:
- A CSV `a` followed by 24 M commas takes 10.4 s and 2.4 GB RSS. It is now *accepted*, with 0 rows, because the blank headers are dropped.
- At f833346 (`probe-onerow-f83.mjs`) the same file took 7.2 s and 2.4 GB, and was then refused.
- HTML with one row of 2.4 M `<td>` takes 4.1 s either way.

The commit only claims the row cap, so this is security N8's remaining single-row form. Stop collecting cells once a row passes `MAX_IMPORT_COLUMNS` × some factor.

## 10. Info: wizard text and test fixture

- When `executeAutoRollback` fails, its reason already starts with "Rollback refused:" or "Rollback failed:". The wizard then shows "Rollback failed: Rollback failed: …".
- `audit2-regressions.test.mjs` now uses `GO_LIVE_RESET_MODULE`, but it still writes the reset row with `m.auditLog`. It would not notice if `executeEnhancedReset` stopped writing that row (arch M1(2), still open).
- The new tests do not cover `auditIdAtStart = 0` (finding 1), numeric or boolean values, a TSV with blank lines, or CRAC audit rows.
