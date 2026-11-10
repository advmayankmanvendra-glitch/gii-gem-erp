# Security audit of commit 219b2d3

- **Date:** 2026-10-29
- **Scope:** `git diff f833346 219b2d3`, read against the whole IPC surface in `src/main/main.js`. The areas checked were the go-live rollback guard, CRAC and closure audit rows, the supplier bank-detail guard (crudHelpers and bankDetailsPolicy), and the import parser, including the Tally migration preview.
- **Method:** code review, plus probes through the real IPC handlers using the `scripts/audit/ipc-security.test.mjs` harness pattern. Parser probes were also run directly. Electron was not launched. The size of the IPC reply was measured with `v8.serialize`, which uses the same structured-clone serializer that Electron runs on the main thread for an `ipcMain.handle` reply.
- **Repository:** not changed. The working tree was clean at 219b2d3 for the whole audit, and nothing was committed or pushed.
- **Probes:** in `/tmp/audit219-security/`. The f833346 probes were copied there and re-run against the live checkout. The new probes are:

| Probe | What it tests |
|---|---|
| `rb219.test.mjs`, `rb219b.test.mjs` | rollback: allocations, voucher proposals, closure mark, rollback erasing work |
| `rb219c.test.mjs` | rollback: legacy history entry |
| `supplier219.test.mjs` | bank details |
| `audit219.test.mjs` | the new CRAC audit rows |
| `dos219-ipc.test.mjs` | parser through IPC |
| `p219.mjs`, `hdr2.mjs`, `combo.mjs` | parser called directly |

Run an IPC probe with:

```
cd /home/claude/gii-gem-erp
node --import ./scripts/audit/lib/electron-register.mjs --test /tmp/audit219-security/rb219b.test.mjs
```

Run a direct parser probe with `node /tmp/audit219-security/p219.mjs xlsxkeys 500 300`. Other modes: `csvkeys`, `csvvalues`, `xlsxvalues`, `sstmany`, `csvcols`, `htmlcells`, `htmlkeys`, and more; the list is in the file.

## Summary

| # | Severity | Finding | Status at 219b2d3 |
|---|---|---|---|
| N3 | Low | CRAC and closure writes left no audit row | **Fixed.** `crac:create`, `crac:update`, `crac:delete` and `crac:closure-mark` now write audit rows, and the guard refuses rollback after each of them. |
| N4 | Low | A field and its alias disagree: an admin wipes `bank_details`, and a non-admin is wrongly refused | **Partly fixed.** Two of the four admin wipes are gone. Two remain, plus a new variant with U+200B. The DEO false refusals remain. A non-admin still cannot change or wipe anything. |
| N5 | Info | Bank values stored with padding | **Fixed.** Padding with a newline, U+2028, U+FEFF, U+00A0, U+200B or spaces is stripped on write. See N10 for a new way around the comparison. |
| N6 | Low | A run that stopped before its reset takes a later Enhanced Reset as its own | **Fixed for current entries**, because the mark is now `auditIdAtStart`. **It remains for legacy entries** that have no `auditIdAtStart` (R-L below). |
| N7 | Medium | A huge shared string freezes the main process | **Fixed for the shared-string vector** by the 32,767-character cell cap and the 64M-character sheet cap. The duplicate-file listing in the Tally preview is **not fixed**. The new freezes and memory bombs are in N11 and N12. |
| N8 | Low | Size limits are checked only after the whole parse | **Partly fixed.** csv rows stop early (0.1 s). A wide single row in csv, tsv or HTML still costs 3–4 s and about 1.5 GB. |
| **N9** | **Medium** | Allocation, advance-adjustment and voucher-proposal writes are invisible to the rollback guard, so a go-live rollback erases them | New. The code is not new, but it answers the brief. |
| **N10** | **Low** | A non-admin sends the account number as a JSON number. The stored text changes from `111122223333` to `111122223333.0`. | New |
| **N11** | **Medium** | Long header names multiply the size of the IPC reply. A 21 KB xlsx makes a 4.5 GB reply, and with 1,000 rows the process is OOM-killed at 12.7 GB. | New, and it gets past every f833346/219b2d3 cap |
| **N12** | **Medium** | An xlsx still blocks the main process for about 9 s within the caps. Listing one picked file many times in the Tally preview makes this unbounded: 46 s measured through IPC. | New. Remainder of N7 and N8. |
| — | Info | The new audit rows | No data leak and no new write path. `company_id` is null and delete rows carry no old value (see "New audit rows"). |

**Answers to the brief:**

- **Can a go-live rollback still erase live work?**
  - **Yes, N9.** An accountant's unallocation, reallocation or advance-adjustment reversal is invisible even with a full mark. A manager's or accountant's voucher-proposal edit, approval or rejection is invisible too. With a lost mark, new allocations and advances are invisible as well. The rollback reproduction restored the backup and undid the unallocation.
  - **Also R-L, narrow.** A legacy history entry with no `auditIdAtStart` still adopts a later Enhanced Reset as its own.
  - CRAC and closure writes (N3), and the lost-mark plus Enhanced Reset case for current entries (N6), are now refused. The 92071b3 and f833346 rollback reproductions are refused too.
- **Can a non-admin change, wipe or pad bank details?**
  - **Change or wipe:** no. Every alias, null, blank, whitespace, invisible-character, `0`, `false` and object payload tried was refused or did nothing.
  - **Pad:** no. Padding is stripped on write (N5 is fixed).
  - **Except N10:** a numeric account number rewrites the stored text by adding `.0`. The digits stay the same, so money cannot be sent elsewhere.
- **Can a crafted csv, xls or xlsx within 25 MB still freeze the main process or exhaust its memory?**
  - **Memory: yes, N11.** The header names are not length-capped, and every row object repeats them in the IPC reply. Results:
    - xlsx, 21 KB: a 4.5 GB reply.
    - xlsx with 1,000 rows: OOM.
    - csv, 16 MB: a 1.5 GB reply with 100 rows.
    - The Tally preview returns 50 rows per file, so 3 listings of a 21 KB file make a 2.3 GB reply.
  - **CPU: yes, N12.**
    - 12M empty shared strings: 4.9 s from an 86 KB file.
    - Header search over cells that contain spaces: 4.6 s from a **1 KB** file.
    - Both together: 9.1 s.
    - The Tally preview accepts the same picked file any number of times. Ten listings took 46 s, with zero timer ticks.
  - The f833346 shared-string vectors are now refused in 22–150 ms.
- **Do the new audit calls leak data or open write paths?**
  - **Leak:** no. CRAC rows hold the CRAC record, which `crac:list` already gives any signed-in user. `audit_log` cannot be read through `records:list` ("Unsupported table").
  - **Write path:** no. The calls run only after the `guarded()` permission check and the service write. A viewer is refused, and a DEO cannot delete.
  - **Chain:** the audit chain verifies.
  - **Minor gaps:** see "New audit rows" (Info).

---

## N9. Medium: allocation, advance and voucher-proposal writes are invisible to the rollback guard

**Where:** `goLiveService.js` `assertGoLiveRollbackSafe`, together with `init.js` `allocationAudit` and `bankReconciliationService.js` `proposalAudit`.

The guard has two checks:

1. A book table's `MAX(id)` grew.
2. An `audit_log` row after the mark names a book table. Book tables are all tables except `NOT_BOOK_TABLES`.

Two families of writes slip past both checks:

**Allocations and advances.** `allocationAudit` writes its `audit_log` row with `table_name = 'allocation_audit'`. That table is in `NOT_BOOK_TABLES`, so the row is dropped. These writes are pure UPDATEs, so with a **full** mark nothing grows:

- `allocations:receipt-unallocate` and `allocations:supplier-unallocate` (`reverse`: accountant, admin);
- the unallocate half of `allocations:*-reallocate`;
- `advances:adjustment-reverse`.

With a **lost** mark (the fallback with `compared = []`), only audit rows count, so even inserts are invisible: `allocations:receipt-create` and `allocations:supplier-create` (`edit`: DEO and above), the advance creates and the advance adjustments.

**Voucher proposals.** `voucher-proposals:update`, `voucher-proposals:approve` and `voucher-proposals:reject` write no `audit_log` row at all. Their only trace is a row in `voucher_proposal_audit`, which is also in `NOT_BOOK_TABLES`. They are UPDATEs, so they are invisible in both modes.

**Reproduction:**

`rb219.test.mjs` T1 and T2, full mark:

| Step | Result |
|---|---|
| Accountant: `allocations:receipt-unallocate 1 "probe T1"` | Audit row `allocation unallocate`, `table_name=allocation_audit` |
| Guard check | **allowed** |
| Accountant: `allocations:supplier-unallocate` | Guard check: **allowed** |

Fallback, with `auditIdAtStart` and a reset row present:

| Step | Result |
|---|---|
| Accountant: `allocations:receipt-create {payment_id:1, billing_id:1, allocated_amount:350000}` | New row id 2 |
| Guard check | **allowed** |

`rb219b.test.mjs` T5, full mark:

| Step | Result |
|---|---|
| Accountant: `voucher-proposals:update` (narration) | Guard check: **allowed** |
| Manager: `voucher-proposals:approve` | Guard check: **allowed** |

The proposal is now `Approved`, and no `audit_log` row was written.

`rb219b.test.mjs` T9, the erase itself:

1. Full mark.
2. Accountant unallocates allocation 1.
3. Guard check: **allowed**.
4. Admin calls `go-live:rollback` and gets `success: true`.
5. In the live database, allocation 1 is back to `is_deleted=0`, "Partially Allocated", with `change_reason=null`. The accountant's unallocation is gone.

**Who can do it.** The rollback itself is admin-only. The work it erases belongs to accountants, managers and DEOs. This is the same class as N3, now in other modules. A `pre_restore_*.db` copy is kept, so recovery by hand is possible.

**Fix:**

- Make the audit query map `allocation_audit` rows to their real table. Alternatively, have `allocationAudit` log `table_name` as the allocation's own table (`payment_allocations`, `supplier_payment_allocations`, `advance_adjustments` and so on). Do the same for `proposalAudit`, or add an `auditLog` call naming `voucher_proposals`.
- Simpler and more robust: treat any `audit_log` row after the mark as work, except an explicit allow-list (`ui:*`, logins, the read-only actions and the reset's own `system` row), instead of requiring a book `table_name`.
- Store `bookHighWater(db)` in the `in_progress` entry. The lost-mark fallback can then compare table ids as well.

## N3 at 219b2d3: fixed

`rollback.test.mjs` test B, re-run:

| Mode | Write | Guard check |
|---|---|---|
| Full mark | DEO `crac:update` | refused ("crac records changed") |
| Fallback | DEO `crac:create` | refused |

`rb219b.test.mjs` T3 set up an order whose closure checklist is complete. A DEO `crac:closure-mark` then wrote `order_operationally_closed` with `table_name=supply_orders`, and the check was refused ("supply orders changed").

`createCracRecord`, `updateCracRecord` and `markOrderOperationallyClosed` have no other caller than these IPC handlers.

## N6 at 219b2d3: fixed, with a legacy remainder (R-L, Low)

When the entry has `auditIdAtStart`, the fallback now counts from that id. `rb83.test.mjs` R2, re-run:

1. The run stopped before its reset, and the failure write was lost.
2. A DEO created a supplier.
3. An admin ran an Enhanced Reset.
4. The check was **refused** ("suppliers changed"), and the supplier survives.

**R-L:** entries written before 2026-10-23 have no `auditIdAtStart`. For them the fallback still sets `mark.auditId = reset`, the first go-live-module reset since `generatedAt`. Reproduction (`rb219c.test.mjs` T4):

| Step | Result |
|---|---|
| Legacy `in_progress` entry (no `highWater`, no `auditIdAtStart`); check | refused ("no record of a reset") |
| DEO `records:create suppliers "T4 Live Work"`; check | still refused |
| Admin `reset:execute-enhanced {company_id:1}`; check | **allowed** |
| `go-live:rollback` | `success: true`; afterwards "T4 Live Work" count is **0** |

**Preconditions:** admin only, and only a legacy run that is still `in_progress` and never reset. Real installs are unlikely to have one.

**Fix:** in the legacy branch, use the first `audit_log` id with `created_at >= since` as the mark, not the reset row. Alternatively, refuse rollback of a legacy entry that has no `highWater`.

## N4 and N5 at 219b2d3

These were reproduced with `supplier.test.mjs`, `supplier83.test.mjs` and `supplier219.test.mjs`. Each case starts from `bank_details = "Account Number: 111122223333 (verified by phone)"`, plus SBI, `SBIN0000001`, Main and `p@upi`.

**N4, fixed cases.** These no longer wipe `bank_details` for an admin:

- `{supplier_account_number:"111122223333", account_number:"999"}`: the column wins.
- `{supplier_bank_name:"SBI", bank_name:"HDFC"}`
- `{supplier_branch:"Main", branch:"Other"}`

**N4, still open:**

| Who | Payload | Result |
|---|---|---|
| admin | `{supplier_account_number:"", account_number:"111122223333"}` | `bank_details` → `""` |
| admin | `{beneficiary_ifsc_code:"SBIN0000001", ifsc:"HDFC0000001"}` | `bank_details` → `""` |
| admin | `{supplier_bank_name:"", beneficiary_bank_name:"SBI", bank_name:"HDFC"}` | `bank_details` → `""` |
| admin | `{supplier_branch:"Main​"}` (new) | `bank_details` rewritten to the composed text; "(verified by phone)" is lost |
| DEO | each of the four payloads above | refused, a false refusal: nothing gated changes after normalization |

**Cause:**

- `partChanged` still compares the raw sent values: a blank column, or a second alias that disagrees, counts as a change. `normalizePayloadForTable` then writes the first alias that has a value, which equals the stored one.
- `differs` uses `String.trim()`, which does not strip U+200B. `bankDetailsPolicy.text()` and `trimBankFields` do strip it. So the composer and the guard disagree about whether a part changed.

**Fix:** compute `partChanged` on the normalized row about to be written, using the same `EDGE_SPACE` strip as the policy.

**N5: fixed.** For a DEO, each of these is allowed and leaves the stored row unchanged, because `trimBankFields` strips the padding:

- `bank_details + "\n"`, `+ " "`, or with a leading `"﻿"`;
- `"SBIN0000001 "`;
- `" p@upi "` and `"p@upi "`.

Characters that are not stripped count as a change and are refused for a DEO: U+2060, U+00AD, U+180E, U+200E, and U+200B inside the value. The same holds on create: an alias, a blank, or U+200B / U+2060 padding.

## N10. Low: a numeric account number changes the stored text

**Where:** `bankDetailsPolicy.text()` and the crudHelpers update path.

`text(value)` is `String(value)`, so the JSON number `111122223333` compares equal to the stored text `"111122223333"`. The guard reports no change. The number is then bound as a REAL into a TEXT-affinity column, and SQLite stores it as `"111122223333.0"`.

**Reproduction** (`supplier219.test.mjs`):

| Who | Payload | Result |
|---|---|---|
| DEO | `records:update suppliers <id> {supplier_account_number: 111122223333}` | allowed; `supplier_account_number` `"111122223333"` → `"111122223333.0"` |
| DEO | `{account_number: 0}` | refused |
| DEO | `{supplier_account_number: false}` | refused |
| accountant | the value sent as an object | refused by SQLite ("can only bind numbers, strings…") |

**Impact:**

- A non-admin can corrupt the format of a payee's account number without the settings permission, and no `bank_details_changed` row is written.
- A payout file then carries `…3333.0`, so the bank rejects or bounces it.
- Money cannot be sent elsewhere: the digits stay the same. Numbers above 2^53 or with leading zeros come out different and are refused.
- The same applies to `account_number` in `companies`, `employees` and `banks` for roles that can edit them.

**Fix:** in `trimBankFields`, write `String(value)` (or refuse anything that is not a string) for the gated fields, before the comparison.

## N11. Medium: long header names multiply the size of the IPC reply

**Where:** `importParserService.js` `toRecords` and `namedColumns`. It is reached through `imports:parse-buffer`, `imports:parse-file` and `tally:preview-master-migration` (`referenceFiles[].rows = rows.slice(0, 50)`).

219b2d3 caps the length of each cell (32,767 characters) and the text of each xlsx sheet (64M characters). It does not cap the header, and csv, tsv and HTML have no per-cell cap at all.

Each header becomes a property key on **every** row object. The structured clone of the reply writes the key string again for each object. A header row of 500 distinct names of 32,000 characters each, followed by R rows of one tiny cell, passes every limit:

- 500 columns;
- 500 × R ≤ 12M values;
- 16M characters of text;
- R + 1 cells of data.

The reply is then about 500 × 32,000 × R bytes.

**Reproduction:**

Direct, `p219.mjs xlsxkeys` and `csvkeys`, plus `htmlkeys` for HTML .xls:

| Input | File | Parse | `v8.serialize` of the result |
|---|---|---|---|
| xlsx, 500 × 32,000-char headers, 10 rows | 20 KB | 104 ms | 94 ms, 153 MB |
| xlsx, the same, 100 rows | 20 KB | 166 ms | 5.9 s, **1.5 GB** |
| xlsx, the same, 300 rows | 20 KB | 239 ms | 3.9 s, **4.6 GB** |
| xlsx, the same, 1,000 rows | 20 KB | — | process **OOM-killed** at 12.7 GB RSS, cgroup OOM |
| csv, 500 × 32,000-char headers, 100 rows | 15.6 MB | 0.4 s | 1.0 s, 1.5 GB |
| xls (HTML), 500 × 40,000-char headers, 100 rows | 19.5 MB | 0.2 s | 2.2 s, 1.9 GB |

Through IPC as `data_entry_operator` (`dos219-ipc.test.mjs`):

| Call | Result |
|---|---|
| `imports:parse-buffer "keys.xlsx"`, a 21,012-byte file, 300 rows | returns 300 rows in 243 ms; the reply serializes to **4,578 MB** in 13.8 s |
| `tally:preview-master-migration`, a picked 50-row `keys.xlsx` listed 3 times | reply of **2,289 MB** |

In Electron, the reply is serialized on the main thread. A reply of several GB blocks the main thread and then either exhausts memory or goes past the IPC message limit. Either way, the app freezes or crashes.

**Who can do it:** any role with `import`, which is DEO, accountant and admin.

**Fix:**

- Cap the length of a header name, for example to 128 characters, and refuse the file otherwise. Real import headers are short.
- Cap the total size of the reply, for example the sum over the header key lengths and cell lengths per row times the rows, at about 50 MB.
- Apply the 32,767-character cell cap to csv, tsv and HTML as well.
- Better: return rows as arrays plus one header list, not as objects keyed by header. Then the keys are sent once.

## N12. Medium: an xlsx still blocks the main process within the caps, and the Tally preview makes this unbounded

**Where:** `parseSharedStrings`, which has no limit on how many strings it reads, and the header search in `parseXlsx`. The header search is now limited to 50 rows, but each row may hold up to 64M characters through `normalizeHeader`. The `replaceAll(" ", "_")` is slow on strings full of spaces. The third part is `previewTallyMasterMigration`, which neither deduplicates the file list nor caps its length.

**Direct results** (`p219.mjs`, `hdr2.mjs`, `combo.mjs`):

| Input | File | Time | Peak RSS |
|---|---|---|---|
| `sharedStrings.xml` with 12M `<si/>` (part < 64 MB) | 86 KB | 4.5–4.9 s | 0.5 GB |
| One unreferenced 60M-character shared string with `&amp;` | 86 KB | 2.4 s | 0.6 GB |
| 49 rows × 39 cells → one 32,767-character shared string `"A A A …"`, no header match | **1 KB** | 4.6 s | — |
| The same with `"aaa…"`, no spaces | 1 KB | 0.1 s | — |
| 12M `<si/>` plus the 1 KB header-search sheet | 86 KB | **9.1 s** | 1.1 GB |

**Through IPC as DEO** (`dos219-ipc.test.mjs`). Timer ticks are counted with a 100 ms interval, and 0 means the event loop was fully blocked.

| Call | Time | Timer ticks |
|---|---|---|
| `imports:parse-buffer`, 12M empty shared strings (87,860 B) | 4.9 s | 0 |
| `imports:parse-buffer`, header-search xlsx (145 KB) | 4.3 s | 0 (then refused for 1,300 columns) |
| `tally:preview-master-migration`, the 87,860 B file picked once and listed **10 times** in `files` | **46.3 s** | 0 |

Errors inside the Tally loop are caught per file. So a file that is refused still costs its full parse each time it is listed, and the list length is chosen by the renderer.

**Who can do it:** any role with `import`.

**Fix:**

- In `previewTallyMasterMigration`, deduplicate `files` by `path.resolve` and cap the count, for example at 20.
- Cap how many `<si>` entries `parseSharedStrings` reads, for example at `MAX_XLSX_CELLS`. Also cap the total decoded shared-string characters at `MAX_SHEET_CHARS`.
- In the header search, normalize only cells shorter than about 200 characters and only the first 500 cells of a row.
- As in every round so far: move parsing to a `worker_thread` or utility process, with a timeout and a memory limit. That bounds all of N11 and N12 at once.

## N8 at 219b2d3: partly fixed

Direct results (`p219.mjs`):

| Input (≤ 25 MB) | f833346 | 219b2d3 |
|---|---|---|
| csv, 12M one-character rows | 10.2 s, 2.5 GB | **0.1 s**, 0.2 GB, refused while reading |
| csv, 12M `,` blank rows | — | 0.6 s; accepted, 0 rows |
| xls (tsv), 25M newlines | — | 1.2 s, 0.8 GB, refused. `text.match(/\n/g)` builds a 25M-element array just to count lines. |
| csv, one row of 12.5M cells | 3.0 s, 1.2 GB | 3.4 s, **1.5 GB**, refused only afterwards |
| xls (tsv), one row of 12.5M cells | — | 3.2 s, 1.5 GB |
| xls (HTML), 2.4M `<td>` in one row | — | 3.8 s, 1.3 GB |
| xls (HTML), 1.3M rows | 4.0 s, 1.4 GB | 3.1 s, 1.2 GB. The row check happens after the case-folding `replace` over the whole text. |

`MAX_IMPORT_VALUES` was **raised** from 5M to 12M. A 49 KB csv or a 5 KB xlsx of 500 columns × 24,000 one-cell rows is now accepted after 2.8–3.2 s, with an 89 MB reply. At 5M this took 1.3–1.4 s.

**Fix:** count the cells of the current row in `parseCsv` and `parseHtmlTable`, and stop past `MAX_IMPORT_COLUMNS`. In `parseDelimited`, count newlines with an `indexOf` loop instead of `match`.

## New audit rows (Info)

`audit219.test.mjs` ran CRAC writes as a DEO, then read the results as a viewer.

**Data exposure: none new.**

- `new_value` holds the CRAC row (`SELECT *`), which the unguarded `crac:list` already returns to any signed-in user, including a viewer.
- `records:list "audit_log"` is refused with "Unsupported table: audit_log".
- The closure row holds `null`, because `markOrderOperationallyClosed` returns nothing.

**Write paths: none new.**

- `auditCrac` runs only after `guarded()` has passed and the service call has returned.
- A viewer is refused on `crac:create`, and a DEO is refused on `crac:delete`.
- A `crac:update` with no fields still writes `crac_updated`. That is harmless: it only blocks rollback, and the DEO could block it anyway with real work.
- `verifyAuditChain` reported a full chain, with nothing broken.

**Gaps (Info):**

- `company_id` is null on every CRAC and closure row, because `auditLog` is not given `result.company_id`. Company-scoped audit views and reports will miss them.
- `crac_deleted` has no `old_value`, and its `new_value` is `"null"`, so the trail does not show what was deleted.
- A `crac:create` or `crac:update` with status Generated also overwrites the CRAC columns of `supply_orders`. The row names only `crac_records`.
- The service write and the audit row are not in one transaction. If `auditLog` threw, the write would stay without an audit row. No caller-controlled way to make it throw was found.

## Info carried over

- **`bank:preview-import`** still has no permission check and no row cap.
- **`.gitignore`** now also ignores `/config/` (alert settings with encrypted secrets) and `database/*.json` (restore markers) in the development checkout. No secrets are tracked at 219b2d3.
