# Security audit of commit a55b2d0

- **Date:** 2026-11-10
- **Scope:** `git diff 219b2d3 a55b2d0`, read against the whole IPC surface in `src/main/main.js`. The areas checked were the go-live rollback guard and the `go-live:rollback` handler, the supplier and company/employee/bank bank-detail guard (`crudHelpers.js`, `bankDetailsPolicy.js`), the import parser (`importParserService.js`), the Tally migration preview, and the new audit rows (CRAC, closure, voucher proposals).
- **Method:** code review, plus probes through the real IPC handlers with the `scripts/audit/lib/electron-register.mjs` harness. Parser probes were also run directly against `parseImportBuffer`, and some against a copy of the 219b2d3 parser for comparison. Electron was not launched. The size of the IPC reply was measured with `v8.serialize`, which is the structured-clone serializer Electron runs on the main thread for an `ipcMain.handle` reply. Main-process blocking was measured with a 100 ms timer: 0 ticks means the event loop was blocked for the whole call.
- **Repository:** not changed by this audit. HEAD stayed at a55b2d0, and nothing was committed or pushed. During the audit, at 16:12, something outside this audit modified `src/renderer/features/dashboards/drilldowns/StockDrilldown.jsx` in the working tree. No probe here writes to the repository. That file is renderer code and outside the scope of these probes. It was left as found.
- **Probes:** in `/tmp/audita55-security/`. The 219b2d3 probes were copied there and re-run against a55b2d0. The new probes are:

| Probe | What it tests |
|---|---|
| `pa55.mjs` | parser called directly: the largest accepted reply, 2M-cell sheets, shared-string plus sheet combinations, TSV blank lines, quoted CSV cells |
| `pa55_old.mjs` + `old219_parser.mjs` | the same modes against the 219b2d3 parser |
| `dosa55-ipc.test.mjs` | parser and Tally preview through IPC as DEO: timer ticks and reply size |
| `suppliera55.test.mjs` | supplier bank details through `records:update`, with numbers, booleans, BigInt, Date, typed arrays, String objects, arrays, `undefined`, aliases and invisible characters |
| `banktables.mjs` | bank fields of `employees`, `banks` and `companies` with `runAsActor`, plus `undefined` keys on `suppliers` |
| `audita55.test.mjs` | the new audit rows: content, actor, who can read them, chain, and the cost of `auditLog` |
| `tables.mjs`, `noid.mjs`, `noaudit.txt` | rollback guard coverage: audited `table_name` values the guard ignores, tables without `id`, and handler-reached write functions that write no audit row |

Run an IPC probe with:

```
cd /home/claude/gii-gem-erp
node --import ./scripts/audit/lib/electron-register.mjs --test /tmp/audita55-security/dosa55-ipc.test.mjs
```

Run a direct parser probe with `node --max-old-space-size=16000 /tmp/audita55-security/pa55.mjs combo`. Other modes: `csvkeys1`, `csvkeys2`, `xlsxfull`, `xlsx2m`, `xlsx2mrows`, `tsvnl`, `tsvcrlf`, `tsvtabs`, `csvquoted`, `csvqq`. The 219b2d3 modes are still in `p219.mjs`.

## Summary

| # | Severity | Finding | Status at a55b2d0 |
|---|---|---|---|
| N3 | Low | CRAC and closure writes left no audit row | **Still fixed.** The rows are now written inside the write's own transaction and carry `company_id` (`cracService.js:244-256`, `orderClosureService.js:530-538`). `rollback.test.mjs` and `rb219b.test.mjs` T3 are refused. |
| N4 | Low | A field and its alias disagree: an admin wipes `bank_details`, and a non-admin is wrongly refused | **Partly fixed.** The U+200B variant is gone. Three admin wipes and three DEO false refusals remain. A non-admin still cannot change or wipe anything. |
| N5 | Info | Bank values stored with padding | **Still fixed.** Normalization now runs at the start of `cleanPayload`. |
| N6 / R-L | Low | A legacy history entry with no `auditIdAtStart` takes a later Enhanced Reset as its own | **Still open.** Only a comment was added (`goLiveService.js:201-202`). `rb219c.test.mjs` T4 still erases live work. |
| N8 | Low | Size limits are checked only after the whole parse | **Not fixed, and slightly worse for TSV.** A wide row in csv, tsv or HTML still costs 3.3–4.2 s and 1.4–1.7 GB. TSV blank lines now take 2.9 s and are accepted; at 219b2d3 this took 1.6 s and was refused. |
| **N9** | **Medium** | Allocation, advance-adjustment and voucher-proposal writes are invisible to the rollback guard | **Fixed.** `rb219.test.mjs` T1/T2/T9 and `rb219b.test.mjs` T5/T9 are now refused, and the T9 rollback no longer erases the unallocation. |
| N10 | Low | A non-admin sends the account number as a JSON number, and the stored text gains `.0` | **Fixed.** Whole numbers are stored as their digits. Fractions, unsafe integers, negatives, NaN, Infinity, BigInt, booleans and objects are refused. |
| N11 | Medium | Long header names multiply the size of the IPC reply | **Mostly fixed; Low remainder (N11-R).** Headers over 100 characters are refused. A 5 KB xlsx still makes a **391 MB** reply, and 20 Tally files make 161 MB. |
| N12 | Medium | An xlsx blocks the main process within the caps, and duplicate listings make the Tally preview unbounded | **Partly fixed; Medium remainder (N12-R).** Duplicate listings are removed and capped at 20 files, and the shared-string count and header-search vectors are closed. A 277 KB xlsx still blocks the main process for **6.6 s**, and 20 different picked files block it for **92 s**. |
| **N13** | **Low** | A key sent with the value `undefined` wipes the stored bank value (admin) or causes a false refusal (non-admin) | New. The code is not new. |
| — | Info | `go-live:rollback` now returns refusals instead of throwing | **Safe.** Fail-closed. A side effect: a refused rollback now leaves no trace at all (see "go-live:rollback handler"). |
| — | Info | The new audit rows | No new data exposure and no new write path. The actor is taken from the session. Minor gaps are listed in "New audit rows". |

**Answers to the brief:**

- **Can a go-live rollback still erase live work?**
  - **N9 is closed.** These are now refused, and the T9 erase reproduction now returns `success:false` with the live unallocation intact:
    - with a full mark: an accountant's unallocation or reallocation, and a manager's or accountant's voucher-proposal edit, approval or rejection;
    - with a lost mark: a new allocation.
  - **Only R-L remains**, as before: a legacy `in_progress` entry with no `auditIdAtStart` takes a later Enhanced Reset as its own. `rb219c.test.mjs` T4 still ends with `success:true` and "T4 Live Work" count 0. It is admin-only and needs a pre-2026-10-23 run that was never reset.
  - **Static coverage of the guard.** Every `table_name` that an `auditLog` call writes is now one of the guard's tables. The exceptions are `system`, `security`, `ui_context`, `audit_log` and two permission-only strings, `imports` and `updates` (`tables.mjs`).
  - **No table lacks an `id`** (`noid.mjs`).
  - **Unaudited writes.** The heuristic scan found one handler-reached write function with no audit call: `submitFeedback`, which writes `feedback_log`, a non-book table.
- **Can a non-admin change, wipe or pad bank details?** **No.** The cases tried on `suppliers`, `employees`, `banks` and `companies`:
  - numbers: `0`, `-0`, `1.5`, `2**53`, `NaN`, `Infinity`, `-1`, and a different safe integer;
  - other value types: BigInt, `true`/`false`, arrays, Date, `Uint8Array`, `new String(...)`, `null`, `undefined`;
  - every alias, alone and in conflict with another;
  - padding with U+200B, U+200C, U+200D, U+FEFF, U+3000 or newlines;
  - invisible characters that are not stripped: U+2060, U+00AD, U+180E, U+200E, U+2066;
  - full-width digits.

  Each one was refused, or left the row unchanged. The full list is in "N4, N10 and N13 at a55b2d0". **Remaining issues:**
  - N4: an admin can still wipe `bank_details` with conflicting aliases.
  - N13: a key sent as `undefined` wipes for an admin and gives a false refusal for others.
  - `supplier_account_name` (the beneficiary name) is still editable by a DEO. This is by design (182b11f N10).
- **Can a crafted csv/tsv/xls/xlsx within 25 MB still freeze the main process for more than about 2 s, or blow up memory or the IPC reply?**
  - **CPU: yes, N12-R.** Through IPC as a DEO, with 0 timer ticks:
    - a 277 KB xlsx: **6.6 s**;
    - HTML .xls with 2.4M `<td>`: 4.2 s;
    - TSV with 25M blank lines: 3.2 s;
    - a csv with one quoted 25M-character cell: 2.8 s.
  - **Memory:** a wide csv/tsv row still peaks at 1.5–1.7 GB of RSS (N8).
  - **Reply: bounded, but large (N11-R).** A 5 KB xlsx gives a 391 MB reply in 0.4 s parse + 0.3 s serialize.
- **Can the Tally preview still be made unbounded?**
  - **No.** It is now bounded at 20 distinct picked files: 21 files are refused in 1 ms, and 10 spellings of one file are parsed once (4.3 s).
  - **But the bound is large.** 20 different picked files of the same crafted xlsx took **92 s** with 0 ticks. Picked paths persist for the whole app run, across users (`main.js:237`).
- **Do the new audit rows leak data or open write paths?**
  - **Leak:** no. The rows are readable by a viewer through `accounting:data`, but they hold CRAC and proposal data that `crac:list` and `voucher-proposals:data` already give a viewer.
  - **Write path:** no. The calls run only after `guarded()`, and the actor comes from the session. A spoofed `user_id` or `created_by` is overwritten.
  - **Chain:** the audit chain verifies (77 rows, nothing broken).
- **Is the `go-live:rollback` refusal change safe?**
  - **Yes.** Every exception from the guard becomes `success:false` before the database is closed, so it fails closed.
  - The only caller (`GoLiveWizard.jsx:171-176`) handles both outcomes.
  - The side effect is that refusals are no longer journaled to the Error Console (Info).

---

## N12-R. Medium: an xlsx still blocks the main process for 4–7 s within every cap, and 20 picked files make the Tally preview take 92 s

**Where:**

- `importParserService.js:6-13` `decodeXml`: five `replaceAll` passes over each shared string.
- `importParserService.js:173-185` `parseSharedStrings`: it now caps the **count** of `<si>` at 2M, but not the decoded characters.
- `importParserService.js:281-314`: the cell walk, which runs three regexes per cell, for up to 2M cells.
- `tallyImportService.js:425-443`: deduplicates and caps at 20, but each file still gets a full parse, and a refused file costs its parse too (`:482`).

**What a55b2d0 fixed:**

| Input | 219b2d3 | a55b2d0 |
|---|---|---|
| 12M `<si/>` | 4.5–4.9 s | **1.0 s**, refused |
| Header search over 32,767-character cells of spaces | 4.6 s | **0.15 s**, refused (header too long) |
| Both together | 9.1 s | **1.0 s**, refused |
| Tally preview, one file listed 10 times | 46 s | **4.3 s**, parsed once, `files: 1` |

**What is left.** The remaining vector combines two parts of one workbook:

- a `sharedStrings.xml` just under the 64 MB part cap, made of one unreferenced string of `&amp;` repeated (decoding it costs about 2.5 s);
- a sheet of 200,000 rows × 10 cells, which is exactly 2M cells and is accepted.

The two vectors sit in different parts, so each one stays under its own cap.

**Direct results** (`pa55.mjs`):

| Input | File | Time | Peak RSS | Result |
|---|---|---|---|---|
| `sstbig`: one 60M-character `&amp;` shared string, never referenced | 86 KB | 2.5 s | 0.6 GB | accepted |
| `xlsx2m`: 199,999 rows × 10 cells, short two-byte headers | 249 KB | 2.0 s | 0.5 GB | accepted, 241 MB reply |
| `xlsx2mrows`: 2M one-cell rows | 188 KB | 2.6 s | 0.4 GB | refused only after the walk |
| `combo`: about 64 MB of `&amp;` plus the 2M-cell sheet | 270 KB | **4.1–4.5 s** | 0.8 GB | accepted, 199,998 rows. The time is the same at 219b2d3 (4.6 s with `pa55_old.mjs`), so this vector is not new; it was simply not measured before. |

**Through IPC as `data_entry_operator`** (`dosa55-ipc.test.mjs`):

| Call | Time | Timer ticks | Result |
|---|---|---|---|
| `imports:parse-buffer "combo.xlsx"` (276,611 B) | **6,555 ms** | 0 | 199,998 rows |
| `tally:preview-master-migration`, `c0.xlsx` listed 8 times plus `./` and `x/../` spellings | 4,341 ms | 0 | `files: 1`, so the deduplication works |
| `tally:preview-master-migration`, **20 distinct picked copies** of `combo.xlsx` | **92,045 ms** | 0 | `files: 20` |
| `tally:preview-master-migration`, 21 files | 1 ms | — | "Preview refused: 21 files were selected…" |

**Who can do it:** any role with `import`, which is DEO, accountant and admin.

- `imports:parse-buffer` takes the bytes straight from the renderer, so no file pick is needed.
- The Tally case needs 20 file-dialog picks. `selectedFiles` (`main.js:237`) is never cleared during a run and is shared by every user and every picker: `imports:select-file`, `tally:select-*`, `documents:*`. So the picks can build up over a session.

**Fix:**

- Cap the decoded shared-string characters at `MAX_SHEET_CHARS` inside `parseSharedStrings`, and refuse a single `<si>` over `MAX_CELL_CHARS`, before `decodeXml`. Excel cannot write a longer one.
- Lower `MAX_XLSX_CELLS`, or cap the cells walked per call, so that the walk alone stays under about 1 s. 2M cells take about 2 s.
- Give the Tally preview a total budget, not only a file count: total bytes read, or total cells parsed across files. Alternatively, parse its files one per call from the renderer.
- As in every round so far: run `parseImportBuffer` and `parseImportFile` in a `worker_thread` or `utilityProcess`, with a time limit and `resourceLimits`. That bounds N8, N11-R and N12-R at once, and the Tally preview becomes cancellable.

## N11-R. Low: a 5 KB xlsx still produces a 391 MB IPC reply

**Where:** `importParserService.js:43-56` `toRecords`.

`MAX_HEADER_CHARS` (`:28`) and `MAX_KEY_CHARS` (`:29`, 128M) count UTF-16 code units, so they do not count bytes. Two-byte header characters (CJK, for example `あ`) therefore serialize at twice the budget. Cell values are not part of the reply budget at all. For xlsx, the values are bounded only by `MAX_SHEET_CHARS` (64M characters, also two-byte capable), and one shared string can fill that from a tiny file.

**Reproduction:**

`pa55.mjs csvkeys1` / `csvkeys2` / `xlsxfull`:

| Input | File | Parse | Reply |
|---|---|---|---|
| csv, 500 one-byte headers × 100 characters, 2,684 one-cell rows | 55 KB | 0.6 s | 133 MB |
| csv, the same with two-byte headers | 148 KB | 0.5 s | **264 MB** |
| xlsx, 500 two-byte headers × 100 characters, 2,684 rows, plus 2,038 cells that reference one 32,767-character two-byte string | **5 KB** | 0.43 s | **391 MB**, serialized in 0.25 s |

Through IPC (`dosa55-ipc.test.mjs`):

| Call | Result |
|---|---|
| `imports:parse-buffer "keys.xlsx"` (5,142 B) | 435 ms, 2,684 rows, **391 MB** reply, serialized in 301 ms |
| `tally:preview-master-migration`, 20 picked copies of `keys.xlsx` (50 rows kept each) | 6.7 s, **161 MB** reply |

**Impact:** much smaller than at 219b2d3, which reached 4.5 GB and then OOM. Each call is now well under 1 s of CPU. It is still an 80,000× amplification of the file into one IPC message. The renderer then rebuilds the result as 1.3M object properties.

Chromium's Mojo layer has a maximum message size, believed to be 256 MB by default. If that limit applies to this Electron build, the 391 MB reply fails or kills the renderer instead of arriving. This was not verified, because Electron was not launched.

**Fix:**

- Count bytes, not characters: `Buffer.byteLength(header, "utf16le")`, or refuse non-Latin-1 headers.
- Budget the whole reply, keys plus values, at about 50 MB.
- Better, as before: return rows as arrays plus one header list.

## N8 at a55b2d0: not fixed, and TSV blank lines are slower

**Where:**

- `parseCsv` (`importParserService.js:58-90`) and `parseHtmlTable` (`:105-126`): no per-row cell count.
- `parseDelimited` (`:92-103`): now `text.split(/\r?\n/)` over the whole text, and blank lines no longer count toward the limit.

| Input (≤ 25 MB) | 219b2d3 | a55b2d0 |
|---|---|---|
| csv, one row of 12.5M cells | 3.4 s, 1.5 GB | 3.3 s, 1.5 GB, refused only afterwards |
| xls (tsv), one row of 12.5M cells | 3.2 s, 1.5 GB | 3.7 s, 1.7 GB |
| xls (HTML), 2.4M `<td>` in one row | 3.8 s, 1.3 GB | 4.2 s, 1.4 GB; through IPC 4,238 ms, 0 ticks |
| xls (HTML), 1.3M rows | 3.1 s, 1.2 GB | 3.6 s, 1.2 GB |
| xls (tsv), 25M `\n` | 1.6 s, refused | **2.9–3.1 s, accepted** (0 rows); through IPC 3,214 ms, 0 ticks |
| xls (tsv), 12.4M `\r\n` | 0.7 s, refused | 1.4 s, accepted |
| csv, one quoted 25M-character cell | 3.3 s | 3.6 s; through IPC 2,838 ms, 0 ticks, a 24 MB reply |

The 219b2d3 column was measured with `pa55_old.mjs`, against the 219b2d3 parser.

**Fix:**

- Count cells per row in `parseCsv` and `parseHtmlTable`, and throw once a row passes `MAX_IMPORT_COLUMNS`.
- In `parseDelimited`, walk lines with `indexOf("\n")` instead of `split`.
- Cap blank lines, or total lines, at a small multiple of `MAX_IMPORT_ROWS`.
- Cap a csv cell at `MAX_CELL_CHARS`, as xlsx does.

## N13. Low: a key sent with the value `undefined` wipes a stored bank value

**Where:** `crudHelpers.js:97`, `return { ...stored, ...payload }`.

The spread copies own properties whose value is `undefined`, so they replace the stored value. Then `cleanPayload` (`crudHelpers.js:150`) writes `payload[field] ?? ""`.

This contradicts `sent()` at `crudHelpers.js:79`, which treats `undefined` as not sent, and the comment at `:73`: "a column the caller did not send keeps its stored value". Electron's structured clone keeps properties whose value is `undefined`, so a form that builds `{ account_number: form.accountNumber }` from an empty field sends one.

**Reproduction** (`banktables.mjs`, `suppliera55.test.mjs`):

| Who | Table | Payload | Result |
|---|---|---|---|
| admin | employees, banks, companies | `{account_number: undefined}` | `account_number` `"111122223333"` → `""` |
| admin | suppliers | `{supplier_account_number: undefined}` | `"111122223333"` → `""`; `bank_details` kept, so the two now disagree |
| admin | suppliers | `{bank_details: undefined}` | `bank_details` → `""` |
| accountant | employees, banks, companies | `{account_number: undefined}` | refused: a false refusal for a no-op |
| DEO | suppliers | `{supplier_name: "X", bank_details: undefined}` | refused: a false refusal of a plain rename |
| DEO | suppliers | `{supplier_account_number: undefined, account_number: undefined}` | refused |

**Impact:**

- No privilege bypass: a non-admin is always refused.
- An admin's save can silently erase a payee's account number or bank text.
- A non-admin's harmless edit is refused with the bank-details message.
- This is the same class as N4.

**Fix:** in `withStoredFields`, drop the keys whose value is `undefined` before merging, for example `Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))`. The alternative is to have `cleanPayload` keep the stored value for `undefined`. Add the admin case as a test.

## N9 at a55b2d0: fixed

The fix has three parts:

- `allocation_audit` and `voucher_proposal_audit` were removed from `NOT_BOOK_TABLES` (`goLiveService.js:173`). The `allocationAudit` rows that name `allocation_audit`, and the growth of both tables, now count.
- `proposalAudit` also writes an `audit_log` row naming `voucher_proposals` (`bankReconciliationService.js:400-402`).
- `mark.auditId != null` (`goLiveService.js:246`) checks a mark at audit position 0.

**Re-run of the 219b2d3 reproductions:**

| Probe | Step | 219b2d3 | a55b2d0 |
|---|---|---|---|
| `rb219` T1, full mark | accountant receipt-unallocate | allowed | **refused** ("allocation audit changed") |
| `rb219` T1, full mark | accountant supplier-unallocate | allowed | **refused** |
| `rb219` T2, lost mark | accountant receipt-create | allowed | **refused** |
| `rb219b` T5, full mark | accountant proposal update | allowed | **refused** ("voucher proposal audit, voucher proposals changed") |
| `rb219b` T5, full mark | manager approve | allowed | **refused** |
| `rb219b` T9 | unallocate, then `go-live:rollback` | `success:true`, unallocation erased | `{success:false}`; live allocation still `is_deleted=1`, "probe T9 live work" |

`rollback.test.mjs` and `rb83.test.mjs` (N3 and N6) are still refused, and the live supplier survives.

**Coverage checks:**

- `tables.mjs`: every `table_name` written by an `auditLog` call is a guarded table. The exceptions are `system`, `security`, `ui_context` and `audit_log`, which are intentional, plus `imports` and `updates`, which appear only in `enforcePermission` contexts (`main.js:923`, `:930`, `:1194`; `tallyImportService.js:428`).
- `noid.mjs`: no table lacks an `id` column. `import_batches` is the only table without AUTOINCREMENT, and its batch writes are audited.
- `noaudit.txt`: the only handler-reached service function that writes without an audit call is `submitFeedback` (`feedback_log`, a non-book table).

**Carried:**

- `users` edits are still skipped by the audit branch (`goLiveService.js:254`), so a password reset or a deactivation after go-live is reverted by a rollback. This was noted in 61dfe2b and 92071b3 L3, and it is admin-only.
- Allowed rollbacks that fail before the restore (refusals returned by `failGoLiveWithRollback`) are still audited.

## R-L at a55b2d0: still open (Low)

`resetAuditIdFor` (`goLiveService.js:192-211`) still uses the first go-live-module reset since `generatedAt` for legacy entries. The lost-mark branch then uses that reset row as the mark (`:242`). The only change is the comment "Remove after 2027-01-31" (`:202`).

`rb219c.test.mjs` T4, re-run:

| Step | Result |
|---|---|
| Legacy `in_progress` entry with no `highWater` and no `auditIdAtStart`; check | refused ("no record of a reset") |
| DEO `records:create suppliers "T4 Live Work"`; check | still refused |
| Admin `reset:execute-enhanced {company_id:1}`; check | **allowed** |
| `go-live:rollback` | `success:true`; "T4 Live Work" count afterwards is **0** |

**Preconditions:** unchanged. It is admin-only and needs a pre-2026-10-23 run that is still `in_progress` and was never reset.

**Fix:** unchanged. Refuse rollback of a legacy entry that has neither `highWater` nor `auditIdAtStart`. Alternatively, use the first `audit_log` id with `created_at >= since` as the mark.

## N4, N10 and N13 at a55b2d0: bank details

`normalizeBankValue` (`bankDetailsPolicy.js:47-52`) now runs at the start of `cleanPayload` (`crudHelpers.js:145`), for the table's bank fields and the supplier aliases. It does three things:

- trims `EDGE_SPACE` from strings;
- turns a non-negative safe integer into its digits;
- refuses anything else with a guided message.

`withStoredFields`, `supplierBankPartsChanged` and `bankDetailChanges` all use `sameBankValue`.

**N10, fixed.** Every case starts from the stored value `"111122223333"` (`suppliera55.test.mjs`, `banktables.mjs`):

| Who | Payload | Result |
|---|---|---|
| DEO | `{supplier_account_number: 111122223333}`, `{account_number: …}` or `{beneficiary_account_number: …}` | allowed; **unchanged** (no `.0`) |
| DEO, accountant | `employees`, `banks` or `companies` `{account_number: 111122223333}` | allowed; unchanged |
| DEO | `111122223334`, `0`, `-0` | refused (settings) |
| DEO | `1.5`, `2**53`, `NaN`, `Infinity`, `-1`, `111122223333n`, `true`, `false`, `["111122223333"]`, `new Date(0)`, `Uint8Array`, `new String("111122223333")` | refused ("must be entered as text") |
| DEO | `{upi_id: 0}`, `{supplier_branch: 7}`, `{bank_details: 5}`; accountant `{supplier_bank_ifsc_code: 0}` | refused (settings) |
| admin | `{supplier_account_number: 1.5}` | refused (text required) |

**Padding and invisible characters:**

| Who | Payload | Result |
|---|---|---|
| DEO | U+200C/U+200D at both ends, a trailing U+3000, a trailing U+200B; padding with `\n`, a space or U+FEFF on `bank_details`, IFSC or UPI | allowed; unchanged |
| DEO | U+2060, U+00AD, U+180E, U+200E or U+2066 at an edge; full-width digits | refused (settings) |
| DEO, create | `supplier_account_number: " ​ "` | stored as `""`, so no padding is stored |
| DEO, create | `upi_id: "⁠"` | refused |

**N4, partly fixed.** The U+200B variant is gone: an admin's `{supplier_branch: "Main​"}` now changes nothing. Still open:

| Who | Payload | Result |
|---|---|---|
| admin | `{supplier_account_number:"", account_number:"111122223333"}` | `bank_details` → `""` |
| admin | `{beneficiary_ifsc_code:"SBIN0000001", ifsc:"HDFC0000001"}` | `bank_details` → `""` |
| admin | `{supplier_bank_name:"", beneficiary_bank_name:"SBI", bank_name:"HDFC"}` | `bank_details` → `""` |
| DEO | each of the three payloads above | refused: false refusals |

**Cause:** unchanged. `partChanged` (`crudHelpers.js:91-95`) still looks at the raw payload: a blank column, or a second alias that disagrees, counts as a change. The normalizer then writes a value equal to the stored one.

**Fix:** unchanged. Compute `partChanged` on the normalized row about to be written.

**Not gated, by design:** a DEO can change `supplier_account_name`, or send it as `beneficiary_account_name`, for example to "Fraud Pvt Ltd". The account number, IFSC and bank text are unchanged, so money cannot be sent elsewhere. This was recorded as an owner decision in 182b11f N10.

**Other paths:**

- `master-data:confirm-update` gates bank keys through `masterImportTouchesBankDetails` (`main.js:979-990`). Its `importValue` always yields text (`masterDataToolsService.js:255-261`), so numbers cannot get `.0` there.
- `imports:confirm` updates go through `updateRecord` (`importValidationService.js:412`), and therefore through the same guard.

## go-live:rollback handler: refusals returned, not thrown (Info: safe)

`main.js:1313-1322` wraps only `assertGoLiveRollbackSafe` in `try/catch` and returns `{ rollbackResult: { success: false, reason: error.message }, reason }`. Checked:

- **Fails closed.** Any exception from the guard becomes a refusal before `withDatabaseClosed` runs: a refusal, a database error, or a bad history file. No path reaches the restore after the guard throws.
- **No time-of-check to time-of-use gap.** The guard, `failGoLiveWithRollback` and the restore are synchronous on the main thread, so no other IPC call can run between the check and the restore. `restoreBackup` replaces the live file at once (`backup.js:163-168`); it does not queue the restore.
- **Caller.** `apiClient.rollbackGoLive` is called only from `GoLiveWizard.jsx:171`. That code shows `rollbackResult.reason` when `success` is false, so a refusal is never shown as success.
- **The reply.** It echoes the renderer's own `reason` back, so no new data reaches the renderer.
- **The pending-restore message** in `rollbackService.js:52` is a text change only.

**Side effect (Info):**

- Before this change, a thrown refusal was journaled to the Error Console by `handle()` (`main.js:758-768`). Now a refused rollback leaves no record anywhere: no Error Console entry and no `audit_log` row.
- An admin's repeated refused attempts, for example while trying to roll back over live work, are therefore invisible afterwards.
- **Fix:** before returning a refusal, write `auditLog(db, { action: "go_live_rollback_refused", table_name: "system", … })`. `system` is not a book table, so this row does not affect the guard.

## New audit rows (Info)

`audita55.test.mjs` ran these writes, then read the results as a viewer:

- an accountant's `voucher-proposals:update`, sent with `user_id` and `created_by` spoofed to the admin;
- a manager's approve, with a spoofed `userId` argument;
- a DEO's `crac:create`, with a spoofed `created_by`.

**Actor:** taken from the session. The rows name the accountant (`user_id` 3), the manager (4) and the DEO (2). `withActor` (`main.js:256-264`) and `actorId()` override the spoofed values.

**Write paths: none new.**

- A viewer is refused on `voucher-proposals:update`, and a DEO is refused on `voucher-proposals:approve`.
- The CRAC and closure audit calls run inside the write's transaction (`cracService.js:279-295`, `:313-344`, `:359-368`; `orderClosureService.js:530-538`). A write and its audit row now commit together or not at all, which closes the 219b2d3 gap.
- `auditLog` costs about 0.1 ms per call: 10,000 calls took 997 ms. Proposal generation now writes one extra row per bank line (`bankReconciliationService.js:587`), which adds about 1 s per 10,000 lines.
- The chain verifies: `{chained:true, verified:77, broken:[]}`.

**Data exposure: none new.**

- `accounting:data` (`main.js:840`) has no permission check and returns the latest 300 `audit_log` rows of the company, `SELECT *` including `old_value` (`accountingService.js:1260`). The viewer saw the new `crac_created`, `voucher proposal proposal edited` (868-byte `old_value`) and `… approved` rows there.
- The same data is already given to any signed-in user by `crac:list` (`main.js:1362`) and `voucher-proposals:data` (`main.js:877`). The viewer could read the edited narration through `voucher-proposals:data` too.
- The exposure of `audit_log` through `accounting:data` is older than this commit. It also returns `login_success` and `password_changed` rows. It deserves its own decision, and the fix is to put `accounting:data` behind `guarded("view", …)` and select only the columns needed.

**Gaps (Info):**

- Proposal rows have `user_role = null`, and the action reads "voucher proposal **proposal** edited", because the service action already starts with "Proposal".
- Approve remarks and reject reasons are stored only in `voucher_proposal_audit`. Probe: the remark "SECRET-R" appears there once and in `audit_log` zero times.
- `approveVoucherProposal` and `rejectVoucherProposal` (`bankReconciliationService.js:680-697`) write the proposal row, `voucher_proposal_audit` and `audit_log` without a transaction. No caller-controlled way to make `auditLog` throw was found.

## Info carried over

- `bank:preview-import` (`main.js:872`) still has no permission check and no row cap.
- `selectedFiles` (`main.js:237`) is one set for the whole run, shared by all users and all pickers. It never shrinks, so a file one user picked can be read later by another signed-in user with `import`.
