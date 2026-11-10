# Security audit of commit f833346

- **Date:** 2026-10-22
- **Scope:** `git diff 92071b3 f833346`, read against the whole IPC surface. Areas covered: `src/main/main.js`, crudHelpers, bankDetailsPolicy, go-live and operational reset, the audit log, the import parser and the Tally migration preview.
- **Method:** code review, plus probes through the real IPC handlers using the `scripts/audit/ipc-security.test.mjs` harness pattern. The repository was not changed: the working tree was clean at f833346 for the whole audit, and nothing was committed or pushed.
- **Probes:** in `/tmp/auditf83-security/`. All of them import from the live checkout `/home/claude/gii-gem-erp`.
  - The 92071b3 probes were copied and pointed at the live repo: `supplier`, `rollback`, `legacy`, `md` and `probe3`.
  - New probes:
    - `rb83.test.mjs`: rollback.
    - `supplier83.test.mjs`: supplier fields.
    - `dos83-ipc.test.mjs`: parser freeze and parser reach, through IPC.
    - `dos3.mjs`, `ss.mjs` and `ss2.mjs`: call the parser directly.

Run an IPC probe with:

```
cd /home/claude/gii-gem-erp
node --import ./scripts/audit/lib/electron-register.mjs --test /tmp/auditf83-security/rb83.test.mjs
```

Run a direct parser probe with `node /tmp/auditf83-security/ss.mjs 10000000 2000`.

## Summary

| # | Severity | Finding | Status at f833346 |
|---|----------|---------|-------------------|
| N1 | Medium | With a lost mark, a later reset moved the rollback mark past live work | **Fixed** for the reported case. A narrower form remains: see N6. |
| N2 | Medium | Header width times row count freezes the parser; quadratic tag strip | **Fixed** for both vectors. A new amplification remains: see N7. |
| N3 | Low | CRAC writes leave no audit row, so the rollback guard cannot see them | **Still open.** Not touched by this commit, and reproduced again. |
| N4 | Low | A field and its alias that disagree: an admin wipes `bank_details`, and a non-admin is wrongly refused | **Still open.** Reproduced again, including with the new aliases. |
| N5 | Info | The bank guard trims values, but the write stores them as sent | **Still open.** Reproduced with newline, U+2028 and spaces. |
| Old 3 | Low | Beneficiary-name aliases rename the supplier | **Fixed.** The beneficiary name itself is still not gated (Info). |
| — | Info | A string `goLiveId` failed open in the assert | **Fixed.** The assert now uses the same history checks and fails closed. |
| — | Info | `imports:parse-file` had no role check | **Fixed.** It now needs `import`. |
| **N6** | **Low** | A go-live run that stopped before its reset takes the next *enhanced* reset as its own. The rollback then erases the work entered in between. | New (what is left of N1) |
| **N7** | **Medium** | An xlsx with one huge shared string, referenced by many cells, freezes the main process. A 10 KB file blocked IPC for 26 s; at the caps the freeze lasts hours. The parsed rows are also a memory bomb for the IPC reply. | New (not covered by the f833346 caps) |
| N8 | Low | The row and column limits are checked only after the whole file is parsed. A 23 MB csv takes 10 s and 2.5 GB RSS before it is refused. | New detail of N2 |

**Answers to the questions in the brief:**

- **Can a go-live rollback still erase live work?** Yes, in two ways:
  - N6: a run that stopped before its reset, followed later by an enhanced reset. Admin only, and it needs the lost history write.
  - N3: CRAC writes are never seen by the guard.

  The N1 reproductions are refused:
  - an ordinary reset of the same company or of another company;
  - a second go-live-module reset;
  - creating a company.
- **Can anyone block go-live or rollback?**
  - A viewer cannot block either. Their only audit rows are `ui:*`, login and password rows on `users`, and `permission_denied`, and the guard ignores all of these.
  - A non-admin cannot forge or delete the reset audit row, or reach the history file. The upload path is sanitized.
  - Any role that enters real work blocks rollback, which is intended.
  - Go-live preconditions are admin-only. They depend on data only through readiness and dependency checks, and foreign keys are ON, so orphan rows cannot be planted through generic CRUD.
- **Can a non-admin change, wipe or rename bank or supplier identity fields?**
  - **Gated bank fields:** no. A DEO cannot set, change or wipe account number, bank name, IFSC, branch, UPI or `bank_details` with any alias, null, blank or whitespace combination tried, including the new `SUPPLIER_UPDATE_ALIASES` paths.
  - **Whitespace padding (N5):** a DEO can still pad a gated value with whitespace, a newline or U+2028. The value itself does not change.
  - **Names:** the supplier name and the beneficiary name are ungated, ordinary fields. A DEO can change them directly. The alias side effects are now limited to what the caller asked for.
- **Can a crafted csv/xls/xlsx still freeze the main process within the 25 MB limit?**
  - Yes, an xlsx: N7, from a file of a few KB.
  - csv, tsv and HTML .xls are now linear, but a near-25 MB file still costs 3–10 s and 1–2.5 GB of memory (N8).
- **Can a role without import permission still reach a parser?**
  - No file parser. A viewer is refused on `imports:parse-buffer`, `imports:parse-file` (even with a file picked in the dialog) and `tally:preview-master-migration`.
  - `bank:preview-import` has no guard and processes caller-supplied rows with a database lookup per row. It is not a file parser and is not new (Info).

---

## N1 at f833346: fixed for the reported case

`executeGoLiveReset` now stores `auditIdAtStart` and `companyId` in the `in_progress` entry. `resetAuditIdFor` now picks the **first** row after `auditIdAtStart` that has:

- `action = 'operational_reset'`;
- `module = 'go_live_preparation'`;
- the same company.

The reset's audit row is now written inside the reset transaction.

`rb83.test.mjs` R1 builds the entry with `recordGoLiveEntry`, exactly as `executeGoLiveReset` does, then loses the later update:

| Step | Check |
|---|---|
| `reset:execute-enhanced` of company 1 (the run's own reset) | allowed |
| DEO `records:create suppliers` | **refused** ("suppliers changed") |
| A second `reset:execute-enhanced` of company 1 | still refused |
| Create company 2, then `reset:execute` of company 2 | still refused ("companies, suppliers changed") |

The re-run 92071b3 `rollback.test.mjs` test A is also refused, and the live supplier survives. Legacy entries without `auditIdAtStart` use the same first-row, module and company filters keyed on `generatedAt`.

Since a0ad93c, every go-live reset was logged with `module = 'go_live_preparation'` and a company id. So the module filter does not drop the reset rows of real legacy entries.

## N6. Low: a run that stopped before its reset adopts a later enhanced reset as its own

**Where:** `goLiveService.js`, `resetAuditIdFor` and the fallback branch of `assertGoLiveRollbackSafe`.

When the entry has no `highWater`, the fallback finds "the first go-live-module reset of the company after `auditIdAtStart`". It then uses **that row's id** as the mark, so only audited writes after that row count.

The trouble is that `reset:execute-enhanced`, the Enhanced Reset in Environment Manager, writes exactly the same row as a go-live reset (`executeEnhancedReset`, module `go_live_preparation`) without creating a go-live entry. Take a run that stopped before its reset, and whose `failed`/`resetFailed` write was also lost. That happens after an app crash or power loss during the pre-reset backup, or a locked history file in the catch. The run stays `in_progress`. It is correctly refused ("no record of a reset") until the next enhanced reset of that company. From then on:

- the enhanced reset is taken as the run's own reset;
- everything entered between the run's start and that reset is ignored;
- rollback restores the run's backup and erases it. That includes masters such as suppliers, which the reset keeps, and the work of every other company.

**Reproduction** (`rb83.test.mjs`, test R2):

1. As admin, call `backup:create`. Then `recordGoLiveEntry({status:"in_progress", backup, auditIdAtStart:<max audit id>, companyId:1})`. No reset runs.
2. The check is **refused** ("no record of a reset"), which is correct.
3. As DEO, call `records:create suppliers {supplier_name:"R2 Live Work"}`. The check is still refused.
4. As admin, call `reset:execute-enhanced {company_id:1, confirm_text:"RESET"}`. The check is now **allowed**.
5. `go-live:rollback {goLiveId:1}` returns `success: true`, restored from the run's backup. Afterwards the "R2 Live Work" count is **0**.

**Who can do it.** Only an admin can, since the enhanced reset and the rollback both need admin. It also needs the run to stop before its reset with the failure write lost. A `pre_restore_*.db` safety copy is kept (`backup.js`), so the data can be recovered by hand.

**Fix.** Use the smallest one that holds:

- In the fallback, use `entry.auditIdAtStart` as `mark.auditId`. Still require that a reset row exists.
  - The reset row itself has `table_name = 'system'`, which the guard already ignores, so nothing legitimate is lost.
  - Any audited work after the run started then blocks the rollback, whichever reset came later.
- Alternatively, write the go-live id into the reset's audit row (`new_value.goLiveId`), and match on it instead of "first go-live-module reset".
- Also store `bookHighWater(db)` in the `in_progress` entry. The fallback can then compare table max ids as well, which closes the fallback half of N3.

## N3 at f833346: still open

The re-run `rollback.test.mjs` test B gives the same result as at 92071b3:

- With a full mark, DEO `crac:update` → check **allowed**.
- In fallback mode, DEO `crac:create` → check **allowed**.

`cracService.js` and `orderClosureService.markOrderOperationallyClosed` still write no audit row. The fix is the same as before: audit CRAC create, update and delete and the closure mark, and keep a table high-water mark in the `in_progress` entry (see N6).

## N7. Medium: a few-KB xlsx with one huge shared string freezes the main process

**Where:** `importParserService.js`, `parseXlsx`.

f833346 caps header width (500), rows (200,000) and values (5,000,000) in `toRecords`. But the header search runs **before** `toRecords`:

```js
const headerIndex = matrix.findIndex((row) => {
  const normalized = row.map(normalizeHeader);   // trim + toLowerCase + replaceAll on every cell
  ...
```

When no row holds a known header name, this normalizes **every cell of every row**.

In an xlsx, every cell with `t="s"` points at the same shared string, and nothing limits its length below the 64 MB part limit. One shared string of S bytes, used by N cells, therefore costs about S × N bytes of `toLowerCase`/`replaceAll` work. Deflate shrinks the repeated string to almost nothing.

| Input (direct parser, `ss.mjs`) | File size | Time |
|---|---|---|
| 1 MB string x 1,000 cells | 1.6 KB | 1.3 s |
| 1 MB string x 4,000 cells | 1.9 KB | 5.6 s |
| 10 MB string x 1,000 cells | 10 KB | 12.5 s |
| 60 MB string x 100 cells | 59 KB | 8.5 s |
| 60 MB string x 1,500,000 cells | ~60 KB | killed after 3 min 40 s; extrapolated to about 44 h at the 2M-cell cap |

**Through IPC**, as `data_entry_operator` (`dos83-ipc.test.mjs`):

| Call | Time | Timer ticks | Result |
|---|---|---|---|
| `imports:parse-buffer`, 10 MB x 2,000, a **10.4 KB** file | **26 s** | **0** (event loop fully blocked) | `rows=1999`, accepted |
| `imports:parse-file`, picked file, 10 MB x 400 | 5.1 s | — | — |
| `tally:preview-master-migration`, the same picked file listed **5 times** in `files` | 25.7 s | — | — |

Each listed file is parsed again, so the duplicate list multiplies any parser cost with a single picked file.

**Second effect: a memory bomb in the IPC reply.** The result passes every cap: 1 column, and fewer than 200,000 rows. Each row holds a reference to the same multi-megabyte string. Electron copies every reference when it serializes the reply to the renderer. Even with a recognized header, where the parse itself is fast (`ss2.mjs`):

| Input | File size | Parse | `v8.serialize` of the result |
|---|---|---|---|
| 10 MB x 100 rows | 10 KB | 23 ms | 614 ms, **954 MB** |
| 60 MB x 50 rows | 59 KB | 134 ms | 7.8 s, **2.9 GB** |

A few hundred rows go past V8's buffer limit, so the main process crashes or freezes.

**Who can do it.** Any role with `import`: data_entry_operator, accountant and admin. A viewer is refused.

**Fix:**

- Cap the length of a single cell value, for example 32 KB. Do it in `parseSharedStrings` and for inline values, and refuse the file otherwise.
- Cap the total length of the output values (sum of the cell lengths) in `toRecords`.
- Normalize only a bounded prefix of each row in the header search. For example, only rows with at most 500 non-empty cells, only the first 50 rows, and only cells shorter than about 200 chars. Header names are short.
- In `previewTallyMasterMigration`, deduplicate `files` by resolved path, and cap how many files one call takes.
- As before, consider moving parsing to a `worker_thread` or utility process with a timeout and a memory limit.

## N8. Low: the size limits are checked only after the whole file is parsed

`toRecords` checks rows and columns after `parseCsv`, `parseDelimited` or `parseHtmlTable` has already built every row array. Direct parser timings (`dos3.mjs`):

| Input | Size | Time | RSS | Result |
|---|---|---|---|---|
| csv, 12M one-char rows | 22.9 MB | **10.2 s** | **2.5 GB** | refused for too many rows |
| csv, one row of 12.5M cells | 23.8 MB | 3.0 s | 1.2 GB | refused for too many columns |
| xls (tsv), 12M rows | 22.9 MB | 3.7 s | 1.4 GB | refused |
| xls (HTML), 1.3M rows | 23.6 MB | 4.0 s | 1.4 GB | refused |
| xlsx, 2M cells, one per row | **0.18 MB** | 2.6 s | 0.4 GB | refused |
| csv / xlsx, 500 cols x 10,000 rows (exactly at the value cap) | 20 KB / <10 KB | 1.3–1.4 s | — | accepted; a 37 MB IPC reply |

The quadratic `<` strip is fixed: one cell of 24M `<` takes 0.6 s.

All of these are linear, but the cost per call is high. Combined with the duplicate-file listing in the Tally preview (N7), it multiplies.

**Fix:** count rows and cells while parsing and stop at the limit. Check the header width as soon as the first row is complete.

## N4 and N5 at f833346: still open

Reproduced with `supplier.test.mjs` and `supplier83.test.mjs`, starting from `bank_details = "Account Number: 111122223333 (verified by phone)"`.

**N4: a field and its alias disagree.**

| Who | Payload | Result |
|---|---|---|
| admin | `{supplier_account_number:"111122223333", account_number:"999"}` | `bank_details` set to `""` |
| admin | `{supplier_account_number:"", account_number:"111122223333"}` | `bank_details` set to `""` |
| admin | `{supplier_bank_name:"SBI", bank_name:"HDFC"}` | `bank_details` set to `""` |
| admin | `{supplier_branch:"Main", branch:"Other"}` | `bank_details` set to `""` |
| DEO | the same payloads | refused |
| DEO | `{beneficiary_ifsc_code:"SBIN0000001", ifsc:"HDFC0000001"}` (stored value first, a different second alias) | refused, a false refusal: nothing gated changes after normalization |
| DEO | `{supplier_bank_name:"", beneficiary_bank_name:"SBI", bank_name:"HDFC"}` | refused, a false refusal |

The cause is unchanged. `partChanged` in `withStoredFields` looks at each sent key on its own. `normalizePayloadForTable` writes the first non-empty alias. When they disagree, the stored text is dropped but no new text is composed.

**N5: padding.** DEO calls that are allowed and stored with the padding:

- `{bank_details:"<stored>\n"}`
- `{supplier_bank_ifsc_code:"SBIN0000001 "}`
- `{upi_id:" p@upi "}`

DEO calls that are refused, which is correct:

- `{supplier_account_number:"   "}`
- `{beneficiary_account_number:"999"}`
- `{ifsc:"HDFC0000001"}`
- `{bank_details:""}`
- `{upi_id:""}`
- `{supplier_account_number:null}`

**Fix (unchanged):**

- Decide `partChanged` on the normalized values that will be written.
- Trim the gated fields on write, in `cleanPayload` and in master-data import.

## Old finding 3 at f833346: fixed

`SUPPLIER_UPDATE_ALIASES` maps each alias to one column, and the account-name aliases no longer reach `supplier_name` on update.

| Payload, as DEO | Result |
|---|---|
| `{beneficiary_account_name:"Mallory Traders"}` | Only `supplier_account_name` changes. |
| `{account_name:"Mallory Traders"}` | Nothing changes. |
| `{supplier_account_name:"Mallory Traders"}` | Only `supplier_account_name` changes. |
| `{beneficiary_account_name:"   "}` and `{account_number:"   "}` | Nothing changes: blank aliases are ignored. |

**Info.** Two ungated behaviours remain:

- **A blank name is refilled from the other name field:**
  - `{supplier_name:""}` renames the supplier to its stored beneficiary name.
  - `{supplier_account_name:""}` resets the beneficiary name to the supplier name.
  - `{supplier_name:"", beneficiary_account_name:"X"}` renames both to X.
- **The beneficiary name is not gated.**

Both name fields are ordinary fields a DEO may already edit, so this is not a privilege escalation. Payouts match on account number and IFSC.

## Info

- **Rollback, string or unknown `goLiveId`.** `assertGoLiveRollbackSafe` now runs `rollbackRefusalReason` first. `go-live:rollback {goLiveId:"3"}` is refused with "not found in the go-live history" (`legacy.test.mjs`, `probe3.test.mjs`).
- **`READ_ONLY_AUDIT_ACTIONS`** gains `bank_statement_direct_post_blocked`, a refusal row that a role with `post` produces. Excluding it hides no work.
- **Viewer and rollback.** The viewer's activity:
  - `audit:context`;
  - a refused create;
  - a refused rollback;
  - a drilldown;
  - a password change.

  None of it blocks rollback (`rollback.test.mjs` test C).
- **Master-data import** with an unchanged bank value is allowed for a fresh supplier (`md.test.mjs`).
- **`bank:preview-import`** has no permission check. It takes caller-supplied rows and runs a duplicate lookup and a match suggestion for each row. It is not a file parser and not new. Guard it with `import` and cap the row count.
- **`.gitignore` and `environment-config.json`.** `.gitignore` now ignores `/environment-config.json`, and the committed copy was removed. No secrets were involved.
