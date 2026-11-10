# Correctness audit of commit 61dfe2b

- Repo: gii-gem-erp
- Diff reviewed: `git diff 182b11f 61dfe2b`, plus the callers of the changed code
- Date: 2026-10-22
- Scratch probes: `/tmp/audit61-correctness/probe1.mjs` to `probe4.mjs`. They run against the repo with plain `node`.

## Overall rating: Medium

`npm run test:integrity` passes: 84/84 node tests and 19/19 IPC tests.

Most of the fixes do what they say:
- An edit form that leaves bank fields out no longer wipes them.
- AsyncLocalStorage keeps the actor across an `await`.
- The guided bank refusal works.
- The history write is atomic.
- The linear XLSX walker is correct and better than the old regexes.
- The apostrophe round-trip works.
- A sub-paisa return posts no voucher.

The commit does have two Medium problems, both in the go-live rollback guard:
- Relaxing the "never reset the books" refusal leaves some runs with no work guard at all.
- The new audit-row check refuses rollback after purely read-only actions.

There are also some Low issues in the new supplier partial-update merge. The UI does not reach them today, but the IPC contract does.

| # | Rating | Area | Finding |
|---|--------|------|---------|
| 1 | Medium | goLiveService | An `in_progress` run with no `resetResult` can now be rolled back with no high-water check at all |
| 2 | Medium | goLiveService | Read-only actions (voucher drilldown, document view or download) block rollback as "changed" |
| 3 | Low | crudHelpers | A partial supplier update that resends a bank part unchanged, without `bank_details`, blanks `bank_details`. A non-admin gets the bank refusal for it |
| 4 | Low | crudHelpers | Sending `supplier_account_name` or `account_name` without `supplier_name` drops the stored supplier name. The supplier is renamed, or the save fails |
| 5 | Low | goLiveHistoryService / goLiveService | `.bak` is one write behind, and a failing failure-write masks the reset error. Both lead back into finding 1 |
| 6 | Low | goLiveService | The all-tables mark also counts tables added later (migrations) and new `users` rows |
| 7 | Info | masterDataToolsService | CSVs exported before this commit lose one apostrophe on a value starting `''` |
| 8 | Info | importParserService | XLSX edge cases: no regressions. Namespaced `x:` sheets and rich-text runs are still unsupported, as before |
| 9 | Info | main.js | main.js still keeps its own synchronous `currentActor`, and `actorId()` reads it |

---

## 1. Medium: some go-live runs can be rolled back with no work guard

**Code:** `failGoLiveWithRollback` (goLiveService.js) now refuses only when there is no `resetResult` and either `resetFailed` is set or the status is `failed`. A run still in `in_progress` with no `resetResult` falls through to `executeAutoRollback`. `assertGoLiveRollbackSafe` starts with `if (!entry?.highWater) return;`. `highWater` and `resetResult` are written by the same `updateGoLiveEntry` call, so such a run has neither value. The run is restored with no check of work done since.

**Before:** 182b11f refused every run that had no `resetResult`.

**How a run ends up `in_progress` with no `resetResult`:**
- (a) `executeEnhancedReset` throws, and then the `updateGoLiveEntry(... failed, resetFailed)` in the catch also throws. Examples are a locked or anti-virus-held file during the new `renameSync`, or a full disk while writing the temp file. The books are untouched, but the entry stays `in_progress`.
- (b) The app or power dies during the reset transaction. SQLite rolls the reset back on reopen, so the books are again untouched.
- (c) The reset finishes but the `highWater`/`resetResult` write is lost. This is the case the commit targets.
- (d) The operator restores `go-live-history.json.bak`, as the new error message tells them to (see finding 5). That file is one write behind and lacks those fields.

**Failure scenario:** the go-live attempt dies as in (a) or (b). The firm carries on entering real invoices and payments for days on the unchanged books. That stuck run is still `history[0]`. Someone presses "Roll back" in the wizard. No high-water exists, so the pre-go-live backup replaces the live database and every entry since is gone. The only way back is the safety copy that `restoreBackup` makes, if someone knows to look for it. The same holds for case (c), where the work is entered on the reset books.

**Repro:** probe3.mjs (G1) creates an `in_progress` entry with no `resetResult`, then adds a supplier. `assertGoLiveRollbackSafe` passes. `failGoLiveWithRollback` reaches the restore step and stops only because the probe's backup file does not exist.

**Fix:** when `highWater` is missing, do not skip the guard. Fall back to a conservative check:
- Look for the reset's own `operational_reset` audit row with `module = 'go_live_preparation'`, written after `entry.generatedAt`.
- If there is none, refuse: the reset never happened.
- If there is one, use its audit id as the mark, and refuse when any book-table audit row comes after it.

Alternatively, write `highWater` in an `updateGoLiveEntry` call that happens before the reset (taken from the backup), so it always exists.

## 2. Medium: read-only actions make rollback refuse with "changed after go-live"

**Code:** `assertGoLiveRollbackSafe` adds every table named in any `audit_log` row after `mark.auditId`. It skips only `users`. Several audit rows record reads, not writes:
- `drilldownData` (init.js ~1300): `action: "voucher drilldown access", table_name: "vouchers"`. This runs on every `accounting:drilldown` call that carries a `voucher_id`. That IPC channel is unguarded, so any signed-in user can trigger it.
- main.js `documents:view` and `documents:download`: `table_name: "documents"`. The documents table is not in `RESET_TABLES`, so the tender papers attached before go-live are still there to be opened.

**Failure scenario:** verification fails after the reset. While deciding what to do, the admin opens an attached document, or clicks a voucher in the ledger drilldown. Rollback is then refused with "Rollback refused: documents changed after go-live GL-0001 … would erase that work", although nothing was changed. The only way out is the manual Backup & Restore path. 182b11f's five-table check did not have this problem.

**Repro:** probe2.mjs. A real `drilldownData(db, { voucher_id: 1 })` after the reset leads to "vouchers changed". A `document view` audit row exactly like main.js writes leads to "documents changed". By contrast, `runProductionVerification`, `completeGoLive` (failing verification), `calculateReadinessScore` and an app restart (`initializeDatabase`) do not trip the guard.

**Fix:** count only write actions. Either list the read actions to ignore (`voucher drilldown access`, `document view`, `document download`, `login_*`, `permission_denied`), or better, mark read audits with a flag or module and filter those out.

## 3. Low: a partial supplier update that resends a bank part blanks `bank_details`

**Code:** in `withStoredFields`, if any bank part (or an alias of one) is sent without `bank_details`, the stored `bank_details` is deleted. Then `supplierBankPartsChanged` sees that no part actually changed, so `composeBankText` is false and nothing rebuilds the text. `cleanPayload` fills the missing field with `""`. The code comment says the text is "rebuilt", but when nothing changed it is erased.

**Failure scenario:** a caller sends `records:update suppliers {supplier_account_number: <same>, remarks: "x"}`.
- As an admin, the update succeeds and silently empties `bank_details`. probe1.mjs P2 shows `'HDFC - 000000000002'` becoming `''`.
- As an accountant, the update is refused with "only an admin can add or change [bank details]", although the user changed none. The blanked `bank_details` counts as a gated change. This is probe3.mjs P2.

**Reach:** MasterScreen always sends `bank_details`, and the import path sends `{...existing, ...incoming}`. So no shipped screen hits this today. It is the exact partial-update contract this commit introduces, though. The ipc-security test only covers callers that send everything except `upi_id`.

**Fix:** delete the stored `bank_details` only when `supplierBankPartsChanged` is true. Or, when parts are unchanged, restore `oldRecord.bank_details` before `cleanPayload`.

## 4. Low: alias handling can rename the supplier or fail a deliberate clear

**Code:** `SUPPLIER_FIELD_ALIASES.supplier_name` lists `supplier_account_name` and `account_name`. When either is sent and `supplier_name` is not, `withStoredFields` deletes the stored `supplier_name`. `normalizePayloadForTable` then fills it from the first truthy alias. `supplier_account_name` is a real column, and its stored value now stands in. "Sent" includes `""`.

**Failure scenarios:**
- `{supplier_account_name: "PRIME IND SUPP"}` renames the supplier "Prime Industrial Suppliers" to "PRIME IND SUPP" (probe1.mjs P1). The supplier name is what reports, payments and the GeM documents show.
- `{account_name: "X"}` also drops the stored name. It is then refilled from the stored `supplier_account_name`. If that value differs from the supplier name, this is a rename too. `account_name` is never mapped to `supplier_account_name`, so "X" itself is ignored (probe3.mjs P1c).
- A deliberate clear `{supplier_account_name: ""}` fails with "supplier name is required" (probe3.mjs P1b). The intended behaviour was a fallback to the supplier name.

**Reach:** only direct IPC partial payloads; MasterScreen always sends `supplier_name`. Before this commit these payloads blanked every other field, so the earlier behaviour was worse. The new merge still gives them the wrong meaning.

**Fix:** for `supplier_name`, treat only the beneficiary or quick-create aliases (`beneficiary_account_name`, `account_name`) as a replacement, and only on create. On update, never let a real column (`supplier_account_name`) stand in for `supplier_name`.

## 5. Low: the `.bak` copy and the failure write can lead into finding 1

- `writeHistory` copies the current file to `.bak` before each rename, so `.bak` always holds the previous version. After the update that adds `highWater` and `resetResult`, `.bak` is the `in_progress` entry without them. The new damage message tells the operator to restore `.bak`. Doing that, combined with finding 1, gives a rollback with no guard.
- In `executeGoLiveReset`, if the catch-block `updateGoLiveEntry` throws, its error replaces the real reset error. The user sees "history could not be read" instead of the reason the reset failed, and the entry is left `in_progress`.
- When a rename fails on Windows (EPERM or EBUSY while a scanner holds the target), the `.tmp-<pid>` file is left behind. This is harmless: the next write reuses the same name.

**Fix:** wrap the failure-path update in its own try/catch, keep the original error, and record the reset failure in the audit log as a second witness. Once finding 1 is fixed, the `.bak` wording is safe.

## 6. Low: the all-tables mark is broader than "books"

- `compared = Object.keys(now.tables)` covers tables that did not exist when the mark was taken; their mark counts as 0. If an app update between go-live and rollback adds a table and seeds it, rollback is refused.
- New `users` rows count as "changed" (only `users` audit rows are skipped). Creating a login for the auditor after a failed go-live blocks rollback. Restoring would drop that user, so this is defensible, but it is inconsistent with skipping user edits.
- Legacy entries (a flat five-table map, `auditId: null`) are handled correctly: only those five tables are compared and the audit check is skipped. Verified in code; the existing test also covers it.

**Fix:** compare only the tables present in `mark.tables`, and decide on `users` explicitly.

## 7. Info: CSVs exported before this commit and the apostrophe rule

The new export doubles a leading `'`, and import strips one `'` before `= + - @ '`. This round-trip is exact for files exported by this build; the new test passes.

Files exported before this commit wrote a stored `''Two` unchanged. They now re-import as `'Two`, a one-character change that `preview` shows as an update. A stored `'=Kept` came back as `=Kept` before this commit and still does. Hand-made CSVs whose cell starts with `''` also lose one apostrophe. This is rare in item and supplier names, so no action is needed beyond a release note.

## 8. Info: XLSX walker edge cases

probe4.mjs compares the 182b11f parser with the 61dfe2b parser.

**Fixed by this commit:**
- A self-closing empty cell `<c r="A2"/>` used to swallow the next cell. The old parser moved "7" into the wrong column; the new one reads it correctly.
- An empty shared string `<si/>` used to shift every later shared-string index. The old parser returned `[]`; the new one returns the right rows.
- `<v xml:space="preserve">` was ignored before and is read now.

**Same as before:**
- A cell with an attribute value containing `>` parses correctly in both versions.
- A rich-text inline string keeps only its first `<t>` run in both versions.
- A worksheet with a namespace prefix (`<x:row>`, `<x:c>`) yields no rows in both versions.

**Ruled out:** prefix collisions (`<cols>`, `<rowBreaks>`, `<tab>`) are skipped by the next-character check. An unclosed element stops the walk instead of rescanning, which is the intended fix.

Later improvements: support for the `x:` prefix, and joining all `<t>` runs in an inline string.

## 9. Info: actor handling

`init.js` now uses AsyncLocalStorage, and probe and test confirm the actor survives an `await`. `main.js` still keeps its own module-level `currentActor` with try/finally, and `actorId()` reads it. Every `guarded()` handler is synchronous today, so nothing is wrong now. An async guarded handler added later would get `actorId() === null` after its first `await`. Timers and promises started inside a call inherit that call's actor, which is correct for the work the call kicks off. The 10-minute alert timer is started outside IPC and correctly has no actor.

## Checked and found correct

- **Sub-paisa supplier return:** when `roundMoney(retValue) == 0`, no voucher is made. The return is still marked Posted with `voucher_id` NULL. Reversal of a return without a voucher goes through `mirrorStockForSource`, so the return can still be reversed. There is no other change to posting results.
- **`deleteRecord`:** the sensitive-write audit now runs only after the delete succeeds. This is correct.
- **`enforceBankDetailPermission`:** it rewrites only role refusals and keeps the "no signed-in user" message. The master-data import path uses it.
- **Stricter history validation:** every history file this code ever wrote has unique integer ids below `nextId`, including the original 4c2dcf6 format. Legacy files are not wrongly rejected.
- **`goLiveVerificationService`:** the audit chain is now checked, including `missingNewestRows`. That is intended, and the tests pass.
