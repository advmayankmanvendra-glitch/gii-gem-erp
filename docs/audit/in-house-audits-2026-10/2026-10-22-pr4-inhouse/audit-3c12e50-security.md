# Security audit of commit 3c12e50

- **Date:** 2026-11-10
- **Scope:** `git diff a97daf4 3c12e50`, read against the IPC surface in `src/main/main.js`. The areas checked were:
  - the a97daf4 findings N12-R, N14, N15, N11-R, N8, R-L and the `goLiveId` length;
  - SEC-1 in `main.js`: `actorId()` from the AsyncLocalStorage actor, `guarded()` with `AUDITED_GRANTS`, the newly guarded channels (`certificate:generate`, `bank:preview-import`, `imports:parse-file`, `imports:parse-buffer`, `feedback:export`), and `accounting:data` blanking the audit log without `view_reports`;
  - any channel that still trusts a user id or company from the screen, any permission bypass, any new way to block the main process for more than about 1 s with a small file;
  - the new `profitability:simulate` channel and the CRAC closure channels.
- **Method:** code review, plus probes through the real IPC handlers with the `scripts/audit/lib/electron-register.mjs` harness. Electron was not launched. As in earlier rounds:
  - the size of the IPC reply was measured with `v8.serialize`;
  - main-process blocking was measured with a 100 ms timer. 0 ticks means the event loop was blocked for the whole call.
- **Repository:** not changed by this audit. The probes ran in a separate worktree at 3c12e50 (`/tmp/audit3c1-security`, removed afterwards). Nothing was committed or pushed.
- **`npm run test:integrity` at 3c12e50:** passes. 104/104 node tests, then 22/22 IPC security tests. Exit 0.
- **Probes:** in `/tmp/audit3c1-probes/`. The a97daf4 probes were copied there and pointed at the 3c12e50 worktree. The new probes are:

| Probe | What it tests |
|---|---|
| `p3c1.mjs`, `emptyt2.mjs` | xlsx within the new caps: shared strings at the 32M raw cap, inline `&quot;` cells filling the 64 MiB sheet part, 2M cells, 999-run `<si>` |
| `n8b.mjs` | csv, tsv and HTML rows of 16,384 cells, blank wide rows, nested tags, mixed-case HTML tags |
| `reply.mjs` | the largest reply the byte budget lets through |
| `dos3c1-ipc.test.mjs` | parser and Tally preview through IPC as a DEO. Modes: `ONLY=parse`, `tally`, `xml`, `stockxml`, `ledgers` (`XMLKB=…`, `SEED=<suppliers>`) |
| `sec3c1.test.mjs` | SEC-1: audit log per role, `permission_granted` rows, newly guarded channels, typed-array cost before the permission check, `profitability:simulate`, closure channels across companies |
| `dd3c1.test.mjs` | `accounting:drilldown` audit rows sent to a DEO |
| `vs3c1.test.mjs` | `health:verification-snapshot` with a user named by the screen |

Run an IPC probe with:

```
cd <a 3c12e50 checkout>
node --max-old-space-size=16000 --import ./scripts/audit/lib/electron-register.mjs --test /tmp/audit3c1-probes/dos3c1-ipc.test.mjs
```

The probe files import from `/tmp/audit3c1-security`. Point them at another checkout before re-running.

## Summary

**Counts at 3c12e50:** 0 High, 2 Medium, 6 Low, plus Info notes.

| # | Severity | Finding | Status at 3c12e50 |
|---|---|---|---|
| **N12-R** | **Medium** | A crafted xlsx blocks the main process; 20 picked files block the Tally preview | **Still open.** The a97daf4 vectors are now refused, but a **153 KB** xlsx still blocks for **3.9–4.5 s** inside the new caps. **20 picked copies (3 MB) block the Tally preview for 86 s.** The cell cap went from 1M to 2M, and the Tally budget from 25 MB to 50 MB, and still counts compressed bytes. |
| **N16** | **Medium** | New. A small, well-formed Tally XML of many ledgers blocks the main process | Older code, first measured now that N14 is fixed. Each ledger runs a full-table-scan duplicate check. With 10,000 suppliers, a **256 KB** XML blocks for **5.2 s** and 1 MB for **22 s**. On an empty database, 20 MB takes 31 s and gives a **225 MB** reply. The XML path has no row cap or reply budget. |
| N14 | — | Quadratic Tally regex | **Fixed.** `tallyTagBlocks` is linear. 50 MB of unclosed tags takes 0.5–1.0 s. `tally:preview-stock-xml` now refuses files over 50 MB (`:430-433`). |
| N15 | — | An editor could approve a voucher proposal | **Fixed.** `update {status:"Approved"}` now stores `Needs Review`, and `create-draft` is refused for the accountant and the DEO. |
| N11-R | — | Reply far larger than the file | **Fixed to its stated cap.** The budget now counts bytes. The largest reply found is 133 MB, from a 101 KB csv. The XML path is still unbounded (see N16). |
| N8 | — | Wide rows and blank HTML rows | **Fixed.** Rows over 16,384 cells and more than 400,000 HTML rows are refused while reading, in 50–230 ms. The worst accepted 25 MB text file takes 1.4 s. |
| `goLiveId` | — | 10 MB `goLiveId` in the refusal audit row | **Fixed.** The row is 184 bytes. The success row still stores `reason` unbounded (Info). |
| SEC-1a | Low | New. The `admin` role no longer receives the audit trail from `accounting:data` | `admin` lacks `view_reports`, so the default admin gets `auditLog: []`. A viewer still gets all of it. |
| SEC-1b | Low | New. `guarded()` copies a typed-array argument into an object before the permission check | A **viewer** sending a 16 MB `Uint8Array` to `imports:parse-buffer` blocks for 8.7 s and is then refused. 24 MB fails with "Too many properties to enumerate". The shipped screens send a plain array, which is fast. |
| SEC-1c | Low | The audit trail still reaches a DEO through `accounting:drilldown` | Every `audit_log` row of a voucher, with `old_value` and `new_value`, is returned to any signed-in user. |
| SEC-1d | Low | `health:verification-snapshot` stores the user the screen names | A viewer recorded a snapshot as `{id:1, name:"admin", role:"super_admin"}`. This is old code. |
| SEC-1e | Low | `AUDITED_GRANTS` covers only `guarded()`. The `permission_granted` row takes `company_id` from the screen | The 8 `sessionGuarded` channels (`settings`, `account_mapping`) write no grant row. That includes `auth:admin-reset-password`. |
| R-L | Low | A legacy go-live entry takes a later Enhanced Reset as its own | **Still open.** The re-run still ends with `success:true` and "T4 Live Work" count 0. |

**Answers to the brief:**

- **Does any channel still trust a user id from the screen?**
  - **No, for the audit trail and permission checks.** `guarded()` checks the session user, and `withActor` overwrites every "who" field in plain-object arguments. A DEO's `records:create` with `user_id:1, created_by:1, userId:1` was audited as the DEO. `actorId()` now has one source.
  - **One file still does:** `health:verification-snapshot` (SEC-1d).
- **Does any channel still trust a company from the screen?**
  - **Yes, but no channel crosses a boundary.** The app has no user-to-company binding: every signed-in user may read every company. So a screen-chosen `company_id` is a filter, not an access check.
  - The only new place is the `permission_granted` row, which files a grant under any company the screen names (SEC-1e).
- **Any permission bypass?**
  - **None found.** `certificate:generate` refuses DEO, accountant and manager, and an admin call writes a grant row. `bank:preview-import` and `imports:parse-*` refuse viewer and manager. N15 is closed.
  - `feedback:export` is allowed to the viewer and the manager. Both roles hold `export`, so this is by design.
- **Any new path that blocks for more than about 1 s with a small file?**
  - **Yes.** A 256 KB well-formed Tally XML (N16).
  - The xlsx path was not made worse per file, but the 2M cell cap and the 50 MB Tally budget make more room (N12-R).
  - Not with a file: a typed array sent by renderer code (SEC-1b).
- **Do `profitability:simulate` or the closure channels leak another company's data?**
  - **No more than existing channels already return.** `profitability:simulate {company_id: 2}` returns company 2's orders to a DEO or a viewer, exactly as `profitability:list` does.
  - `crac:closure-compute` takes a bare order id, so a DEO computing the closure of a company-2 order sees "Still to receive on INV-SECRET-77".
  - Neither is a new class of exposure; see the Info notes.

---

## N12-R. Medium: a 153 KB xlsx still blocks for about 4 s; 20 of them block the Tally preview for 86 s

**What 3c12e50 fixed** (`importParserService.js`):

- An inline cell over 6 × 32,767 raw characters is refused before decoding (`:385`). `inlinebig` now takes 0.2 s, against 2.9 s before.
- All shared strings together are capped at 32M raw characters (`:254`).
- More than 1,000 `<t>` runs in one `<si>` are refused, so `emptyt` takes 0.26 s, against 1.5 s before.
- `decodeXml` (`:8`) is one regex pass.

**What is left.** Each part can still be filled to its cap with dense entities, and both are decoded:

- **Shared strings:** 170 `<si>` of 32,767 × `&quot;`, which is 196,602 raw characters each. That is under the 32M raw cap and the 16M decoded cap.
- **Sheet:** 341 inline `t="str"` cells of 32,767 × `&quot;`. Each cell passes `:385` (196,602 ≤ 196,602) and decodes to exactly 32,767 characters. Together they fill the 64 MiB sheet part. `MAX_SHEET_CHARS` (`:284`) counts decoded text, which is only 11M here.
- The file is refused only after the whole walk, by the header check.

The `decodeXml` callback runs once per entity, about 11M times per part. That is slower per character than the old `replaceAll` chain. So `sstonly` went from 1.3 s, accepted, to 1.7 s, refused.

**Direct results** (`p3c1.mjs`, `p97.mjs`, `emptyt2.mjs`):

| Input | File | Time | Peak RSS | Result |
|---|---|---|---|---|
| `sstmax`: shared strings at the raw cap | 49 KB | 1.4 s | 0.4 GB | accepted, 0 rows |
| `sheetmax`: 341 inline cells | 104 KB | 2.8 s | 0.5 GB | refused afterwards |
| **`both`** | **153 KB** | **3.9 s** | 0.5 GB | refused afterwards |
| `emptyt999` + 340 inline cells | 191 KB | 4.2 s | 0.7 GB | refused afterwards |
| `sstcells`: shared strings + 2M plain cells | 224 KB | 3.1 s | 0.5 GB | **accepted**, 199,998 rows |
| `cells2m`: 2M plain cells (the new cap) | 175 KB | 1.4 s | 0.3 GB | accepted |
| a97daf4 `double` / `sstonly` / `combo1m` | 99–195 KB | 1.7–1.8 s | 0.4–0.5 GB | refused at the raw cap |

**Through IPC as `data_entry_operator`** (`dos3c1-ipc.test.mjs`):

| Call | Time | Ticks | Result |
|---|---|---|---|
| `imports:parse-buffer` `both.xlsx` (156,749 B) | **4,471 ms** | 0 | refused |
| `imports:parse-buffer` `sstcells.xlsx` | 3,412 ms | 0 | accepted, 1.5 MB reply |
| `tally:preview-master-migration`, **20 distinct picked** `both.xlsx`, 3.0 MB in total | **86,111 ms** | 0 | `files: 20`, 20 errors |
| `tally:preview-master-migration`, 2 × 25 MB blank-row `.xls` | 2,290 ms | 0 | accepted, 0 rows |

**Why the Tally budget still does not help:**

- `MAX_TALLY_PREVIEW_BYTES` (`tallyImportService.js:439`) is now **50 MB**. It still sums `fs.statSync().size` (`:460`), which is the compressed size for an xlsx.
- At a97daf4, 20 files took 75 s. Now they take 86 s.
- For csv, tsv and HTML the budget now allows two worst-case files instead of one: 2.3 s measured.

**Who can do it:** any role with `import`. `imports:parse-buffer` needs no file pick. The Tally case needs 20 picks; `selectedFiles` (`main.js:237`) is still shared and never cleared.

**Fix:**

- Cap the **raw** text of the sheet part as the shared strings now are. For example, refuse once raw inline text passes 16 MiB.
- Return `MAX_XLSX_CELLS` to 1M, unless a real file needs 2M.
- Budget the Tally preview on inflated bytes or parsed cells. Alternatively, allow one xlsx per preview call.
- As in every round: run `parseImportBuffer`, `parseImportFile` and the Tally preview in a `worker_thread` or `utilityProcess`, with a time limit and `resourceLimits`. That bounds N12-R and N16 together.

## N16. Medium (new): a 256 KB well-formed Tally XML blocks the main process for 5 s

**Where:** `tallyImportService.js:499`. `namedTallyBlocks(xmlText, "LEDGER").forEach(… tallyLedgerCandidate(db, block, …))` does the following for each ledger:

- `tallyLedgerCandidate` (`:303-318`) calls `findMasterImportDuplicate(db, classification.master, payload, firstCompanyId(db))`.
- `findMasterImportDuplicate` (`importValidationService.js:67`, `:72`) queries `WHERE LOWER(TRIM(COALESCE(field,''))) = ?`. An index cannot serve that, so each query **scans the whole master table**.
- One "Sundry Creditors" ledger costs up to four scans of `suppliers`, plus `firstCompanyId` and a `PRAGMA` per call.
- So the cost is ledgers × suppliers. Stock items (`tallyStockItemCandidate`, `:94`) do the same against `items`.

N14's fix made the tag scanner linear, so this is now the dominant cost. The preview keeps every ledger: there is no row cap (xlsx reference files keep 50 rows) and no reply budget.

**Reproduction.** The file is `<LEDGER NAME="Lx"><PARENT>Sundry Creditors</PARENT></LEDGER>` repeated (`dos3c1-ipc.test.mjs ONLY=ledgers`), sent to `tally:preview-master-migration` as a DEO:

| File | Ledgers | Suppliers in the database | Time | Ticks | Reply |
|---|---|---|---|---|---|
| **256 KB** | 4,179 | 10,000 | **5,172 ms** | 0 | 2.9 MB |
| 1 MB | 16,558 | 10,000 | **22,367 ms** | 0 | 11.4 MB |
| 1 MB | 16,558 | 1 (fresh) | 1,590 ms | 0 | 11.4 MB |
| 5 MB | 82,094 | 1 | 8,229 ms | 0 | 56.7 MB |
| 20 MB | 324,348 | 1 | 30,732 ms | 0 | **225 MB** |

- At the 50 MB budget and 10,000 suppliers, this extrapolates to about **18 minutes** and a reply of about 560 MB.
- A genuine Tally export from a large company could also reach this cost.

**Who can do it:** any role with `import`. The user must pick the file.

**Status:** older code. It was not reachable as the main cost while N14's regex dominated.

**Fix:**

- Load the existing names, GSTINs, codes and account numbers once per preview into `Map`s, keyed by `normalizeDuplicateKey`. Look each ledger up in memory.
- Cap the ledgers and stock items kept in the preview reply, as the reference files are capped at 50 rows. Return counts for the rest.
- Count the XML reply against the same byte budget as `toRecords`.
- Move the preview off the main thread (see N12-R).

## SEC-1 review

**What works** (`main.js:236-317`, `init.js:1604-1614`):

- `actorId()` reads the AsyncLocalStorage actor that `handle()` sets for every signed-in call (`main.js:785`). The old module-level `currentActor` is gone, so two windows cannot see each other's actor across an `await`.
- `withActor` (`:260-272`) now skips non-plain objects.
- `go-live:rollback` tells refusals from faults by `error.code === ROLLBACK_REFUSED`, not by message text.
- Probes (`sec3c1.test.mjs`):

| Check | Result |
|---|---|
| DEO `records:create suppliers {user_id:1, created_by:1, userId:1}` | audited as the DEO (id 3) |
| `certificate:generate` as DEO, manager, accountant | "Permission denied: system_reset" |
| `certificate:generate` as admin | ok; one `permission_granted` row, user 1 |
| `bank:preview-import`, `imports:parse-buffer` as viewer, manager | "Permission denied: import" |
| `feedback:export` as viewer, manager | allowed (both roles hold `export`) |
| unguarded reads (`accounting:data`, `dashboard:counts`) as admin | no grant rows written |
| `records:list "audit_log"` | "Unsupported table" |

### SEC-1a. Low (new): the admin role gets an empty audit trail from `accounting:data`

**Where:** `main.js:850-855` returns `auditLog: []` unless `roleCan(actor.role, "view_reports")`. In `authService.js:7`, `admin` has no `view_reports`; only `super_admin` (`*`), accountant, manager and viewer do.

**Probe:** `accounting:data {company_id:1}`, rows in `auditLog`:

| viewer | DEO | accountant | manager | **admin** | super_admin |
|---|---|---|---|---|---|
| 74 | 0 | 74 | 74 | **0** | 74 |

**Impact:**

- The seeded `admin` user is `admin`, not `super_admin`, so on a normal install the administrator cannot review logins, `permission_denied`, or the new `permission_granted` rows.
- A viewer can review all of them.
- No access is opened. The loss is oversight.
- The integrity suite tests only the DEO and the accountant, so it does not catch this.

**Fix:** gate on `roleCan(role, "view_reports") || roleCan(role, "settings")`, or add `view_reports` to `admin`. Add the admin case to the SEC-1 test.

### SEC-1b. Low (new): `guarded()` copies a typed array into an object before checking permission

**Where:** `guarded()` (`main.js:300-306`) runs `firstPayload(args)` (`:187`). That returns the first non-array object argument, which is a `Uint8Array` or `Buffer` when one is sent. It is then spread into the `enforcePermission` context (`{...payload, …}`), one property per byte. This happens **before** the permission check.

`imports:parse-buffer` became `guarded` in 0dd9a61. Before that, it built its own context.

**Probe** (`sec3c1.test.mjs`):

| Caller | Bytes | Time | Ticks | Result |
|---|---|---|---|---|
| viewer, `Uint8Array` | 1 MB | 436 ms | 0 | Permission denied |
| viewer, `Uint8Array` | 4 MB | 1,515 ms | 0 | Permission denied |
| viewer, `Uint8Array` | 8 MB | 3,493 ms | 0 | Permission denied |
| viewer, `Uint8Array` | **16 MB** | **8,712 ms** | 0 | Permission denied |
| viewer, `Uint8Array` | 24 MB | 5,176 ms | 0 | "Too many properties to enumerate" |
| DEO, 8 MB csv as `Uint8Array` | 8 MB | 3,309 ms | 0 | parsed, then refused |
| DEO, same csv as a plain `Array` | 8 MB | 114 ms | 0 | parsed, then refused |

**Impact:**

- The shipped screens send `Array.from(new Uint8Array(…))` (`importParsers.js:5`, `fileParsers.js:379`, `BankStatementScreen.jsx:72`). `firstPayload` skips arrays, so normal use is not affected.
- Renderer code that sends a typed array does trigger it, and so does the integrity test at `ipc-security.test.mjs:413`. The role needs no permission.
- A genuine csv over about 20 MB, if sent as a typed array, fails with an unguided V8 message instead of the 25 MB rule.

**Fix:** in `firstPayload`, accept only plain objects (the same prototype check as `withActor`). Alternatively, build the `guarded` context from named fields only: `company_id`, `record_id`, `module`.

### SEC-1c. Low: the audit trail still reaches a DEO through `accounting:drilldown`

**Where:** `accounting:drilldown` (`main.js:935`) is not guarded. With a `voucher_id`, it returns `voucherDetail` (`init.js:1320`), which includes `SELECT * FROM audit_log WHERE table_name='vouchers' AND record_id=?`.

**Probe** (`dd3c1.test.mjs`): for the same DEO,

- `accounting:data` gives `auditLog` with 0 rows;
- `accounting:drilldown {voucher_id}` returns `[{action:"voucher edited", old_value:'{"amount":100}', new_value:'{"amount":900}'}]`.

Also unchanged:

- `allocationAudit` in `accounting:data`;
- `voucher_proposal_audit` in `voucher-proposals:data` (`bankReconciliationService.js:632`).

These are narrower than the full log: no logins or password changes.

**Fix:** apply the same `view_reports` rule (with the SEC-1a fix) to `voucher.audit`, `allocationAudit` and the proposal audit. Alternatively, decide and document that these per-record histories are not "the audit trail".

### SEC-1d. Low: `health:verification-snapshot` records the user the screen names

**Where:** `main.js:1176` is not guarded and passes the screen's `context` to `recordVerificationSnapshot`. That function stores `user: {id: context.user_id, name: context.user_name, role: context.role}` (`verificationService.js:119-122`) in the verification history file. This is old code (a95b29b).

**Probe** (`vs3c1.test.mjs`): a viewer sent `{user_id:1, user_name:"admin", role:"super_admin"}`. The snapshot was stored with that user.

**Impact:** it is not the audit log, but the Verification Console shows who took each snapshot.

**Fix:** take the user from `ambientActor()` and the session's username. `health:support-bundle` (`:1151`) also copies the screen's `context` into the bundle file; stamp or drop the user fields there too.

### SEC-1e. Low: `AUDITED_GRANTS` misses the `sessionGuarded` channels and files grants under a screen-chosen company

**Where:** the grant row is written only in `guarded()` (`main.js:309-311`).

- **Missing rows.** The 8 `sessionGuarded` channels write no `permission_granted` row: `auth:admin-reset-password` and `auth:list-users` (`settings`, `:821`, `:828`), and six `account_mapping` channels (`:858-882`, `:1113`). Probe: after `auth:list-users` and `account-mapping:registry` as admin, no audit row was added.
  - `adminResetPassword` audits itself, so the reset is still recorded.
- **Screen-chosen company.** The row's `company_id` is `payload.company_id` from the screen. Probe: an admin calling `alerts:get-settings {company_id: 2}` wrote a grant row filed under company 2. `accounting:data` filters the log by company, so the grant shows only in that company's view. The actor is correct.
- **Order of writes.** The row is written before the handler runs and outside its transaction. A grant for a call that then fails stays in the log. For `restore_backup`, the row goes into the database that the restore then replaces.

**Fix:**

- Write the grant row in `sessionGuarded` too.
- Store the company only when the handler confirms it, or store `null` for system-wide permissions.
- Optionally, write the row after the handler and record its outcome.

## N15 at 3c12e50: fixed

`bankReconciliationService.js:657-659` always sets `status: "Needs Review"`. Editing an `Already Booked` proposal is now refused (`:644`).

`sod97.test.mjs`:

| Step | Result |
|---|---|
| accountant `voucher-proposals:approve` | "Permission denied: approve" |
| accountant `update {status:"Approved"}` | ok; stored status `Needs Review`, `approved_by` null |
| accountant `create-draft` | "Proposal must be approved before draft voucher creation" |
| accountant `post-draft` | "Create a draft voucher before posting" |
| DEO `update {status:"Approved"}`, then `create-draft` | ok, then refused |
| audit rows | both say `"status":"Needs Review"` |

`vp97.test.mjs`: the transactions still hold. A failed audit step leaves no change, and the chain verifies (72 rows, none broken).

**Minor:** an edit of an approved proposal does not clear `approved_by`. This is harmless, because `create-draft` checks `status`.

## N14 at 3c12e50: fixed

`tallyTagBlocks` (`tallyImportService.js:45-61`) finds each opening tag with a regex and each closing tag with a second regex that starts after it. It stops at the first opening tag that has no `>` or no closing tag. All lookups now use it: `tallyTagValue`, `tallyNestedTagValue`, `tallyRepeatedTagValues`, `namedTallyBlocks` and `tallyGstRate`.

| Input (as DEO) | a97daf4 | 3c12e50 |
|---|---|---|
| 1 MB of unclosed `<SVCURRENTCOMPANY>`, master preview | 46,328 ms | **10 ms** |
| 10 MB, same | — | 77 ms |
| 50 MB, same | (hours) | 527 ms |
| 1 / 10 / 50 MB of unclosed `<RATEDETAILS.LIST>` inside one `STOCKITEM` | — | 21 / 175 / 980 ms |
| `tally:preview-stock-xml`, 1 MB unclosed | — | 6 ms |
| `tally:preview-stock-xml`, 50.1 MB | read in full | refused in 1 ms (`:430-433`) |

`tallyAttribute` (`:37`) is still a regex, but `[^"]*` cannot backtrack across a quote, so it is linear.

## N11-R at 3c12e50: fixed to the stated cap

`toRecords` counts bytes with `textBytes` (`importParserService.js:37`): any character past U+00FF counts 2 bytes, matching V8's one-byte and two-byte strings.

| Input (`reply.mjs`) | File | Parse | Reply |
|---|---|---|---|
| a97daf4 `xlsxreply` | 5 KB | 22 ms | refused (was 260 MB) |
| a97daf4 `csvkeys2` | 148 KB | 33 ms | refused (was 264 MB) |
| csv, 500 two-byte headers, 1,342 rows (at the budget) | 145 KB | 227 ms | 132 MB |
| csv, 500 Latin-1 headers, 2,684 rows | 101 KB | 379 ms | 133 MB |

- The reply is bounded at about 128 MiB plus overhead.
- The earlier advice of about 50 MB still stands, but this is no longer a finding.
- Tally reference files keep 50 rows each. The XML path is unbounded (N16).

## N8 at 3c12e50: fixed

- `parseCsv` (`:100`), `parseDelimited` (`:135-136`, `split(delimiter, 16,385)`) and `parseHtmlTable` (`:171`) refuse a row over 16,384 cells while it is being read.
- Every HTML `<tr>`, blank or not, counts toward 400,000 (`:154-160`).
- The mixed-case tag rewrite no longer uses a callback.

| Input (≤ 25 MB, direct) | a97daf4 | 3c12e50 |
|---|---|---|
| csv / tsv header of 12.5M cells | 3.2 / 4.1 s | **51 / 81 ms**, refused |
| HTML header of 2.4M `<th>` | 4.5 s | 222 ms, refused |
| HTML 2.7M blank `<td>` | 4.4 s, accepted | 193 ms, refused |
| HTML 2.9M blank `<tr>` | 4.1 s, accepted | 189 ms, refused |
| csv, wide data row | 0.8 s | 55 ms, refused |

The worst inputs that are still accepted:

| Input (`n8b.mjs`) | Time | Result |
|---|---|---|
| tsv, rows of 16,383 blank cells | 1.4 s | accepted, 0 rows |
| HTML, rows of 16,384 blank `<td>` | 1.3 s | accepted, 0 rows |
| HTML, 3.5M nested `<i></i>` in one cell | 1.2 s | accepted, 0 rows |
| mixed-case `<Tr><tD>` rows | 1.1 s | refused at 200,000 rows |

Through the 50 MB Tally budget, two such files take 2.3 s. That is acceptable for 50 MB.

## `goLiveId` length: fixed

- `main.js:1332` stores `String(goLiveId).slice(0, 64)` and `reason.slice(0, 500)`.
- `rb97.test.mjs`: the 10 MB `goLiveId` from the admin now writes a **184-byte** row (it was 10,485,880 bytes).
- Malformed ids (`null`, `{a:1}`, `[21]`, `"21"`, `21`) all give "not found".
- A corrupt history file is still thrown.
- The chain verifies (97 rows).

**Info:** the success row (`:1336`) still stores the screen's `reason` unbounded. That needs a real history entry and the admin role. Apply the same `slice`.

## R-L at 3c12e50: still open (Low)

`goLiveService.js` changed only to add `ROLLBACK_REFUSED` codes. `resetAuditIdFor` (`:192-211`) still takes the first `operational_reset` after `generatedAt` for a legacy entry.

`rb97.test.mjs`:

| Step | Result |
|---|---|
| legacy entry; check | refused, "no record of a reset" |
| refusal row; check again | still refused |
| DEO creates "T4 Live Work"; admin `reset:execute-enhanced` | ok |
| check | **allowed** |
| `go-live:rollback` | `success:true`; "T4 Live Work" count **0** |

**Fix (unchanged):** refuse rollback of an entry that has neither `highWater` nor `auditIdAtStart`.

## `profitability:simulate` and the closure channels

**`profitability:simulate`** (`main.js:849`):

- It is not guarded, the same as `profitability:list`.
- It calls the same `orderProfitability(db, filters)` with the screen's `company_id`. It returns the same rows plus a computed scenario. It saves nothing.
- Probes as DEO and viewer:
  - `{company_id: 2}` returns company 2's order `SO-OTHER-1`, as `profitability:list` does.
  - `billingAdjustment: 1e308` is clamped to +1000%, and non-numbers become 0.
- **No new exposure.** It follows the app-wide model, where every signed-in user may read every company.
- **Info:**
  - A DEO lacks `view_reports` but receives the full profit report here, and P&L, trial balance and balance sheet from `accounting:data`. Only the audit log is gated. If reports are meant to need `view_reports`, gate these channels too.
  - `filters = null` throws "Cannot read properties of null". A plain error, no impact.

**`crac:closure-compute`** (`:1387`):

- It is not guarded and takes a bare order id, with no company check. That was already true at a97daf4.
- New in this commit: the `detail` text names the unsettled invoice numbers. Probe: a viewer computing a company-2 order received "Still to receive on INV-SECRET-77".
- That invoice number is also readable through `records:list invoices`, so no new data is exposed.
- **`crac:closure-mark`** is still `guarded("edit")`. A viewer is refused. A DEO is refused with the checklist reasons while the order is unsettled.
- `closure-pending` filters by the screen's company.
- **Info:** if company scoping is added later, `computeOrderClosure` should take `company_id` and check `order.company_id`.

## Info

- `bank:preview-import` now needs `import` and closes the a97daf4 carry-over. `selectedFiles` (`main.js:237`) is still one set for the whole run, shared by all users and pickers, and it never shrinks.
- `storableValue` now stores booleans as `"1"`/`"0"`. The probe shows a DEO's `{supplier_name: true}` stored as `"1"`, not `"1.0"`.
- The entity search marks `supply_orders` as `companyScoped` (`entitySearchService.js:33`). This is a picker filter, not an access check.
- No regressions were found in the bank-detail rules (`supplier97.test.mjs`: the a97daf4 results repeat).
