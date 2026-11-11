# Security audit of commit 61dfe2b

- **Date:** 2026-10-22
- **Scope:** `git diff 182b11f 61dfe2b`, read against the whole IPC surface (`src/main/main.js`, crudHelpers, bankDetailsPolicy, master-data tools, generic import and rollback, go-live, import parser, CSV guard).
- **Method:** code review, plus probes through the real IPC handlers using the `scripts/audit/ipc-security.test.mjs` harness pattern. The probe scripts are in `/tmp/audit61-security/` (`probe.test.mjs`, `probe2.test.mjs`, `probe3.test.mjs`, `redos.mjs`). Nothing in the repo was changed.

Run a probe with:

```
cd /home/claude/gii-gem-erp
node --import ./scripts/audit/lib/electron-register.mjs --test /tmp/audit61-security/probe.test.mjs
```

## Summary

No way was found for an accountant or a data_entry_operator to set, change or wipe a gated bank field. The gated fields are account number, bank name, IFSC, branch, UPI and the `bank_details` text. The guard runs on the row that is actually written, after alias mapping and the stored-value merge, so every bypass attempt we tried was refused:

- alias fields;
- omitted fields;
- `null`, `""` and `undefined`;
- whitespace;
- the `bank_details` text;
- generic import with `update_existing`;
- master-data import, including label headers, duplicate keys and apostrophe prefixes;
- employee and company edits.

The move of the actor to AsyncLocalStorage is sound. Every non-public channel runs inside `runAsActor`. No public channel writes a gated table. No timer or menu path writes these tables.

The open issues are elsewhere:

| # | Severity | Finding |
|---|----------|---------|
| 1 | **Medium** | The go-live rollback guard is skipped when a run has no high-water mark. After 61dfe2b that rollback is no longer refused, so it can erase work entered after go-live. |
| 2 | **Medium** | The xlsx and xls parsers can still freeze the main process: a quadratic `<sheet` regex, a regex built from the file's own text (exponential ReDoS), and the lazy `<tr>` regex in the legacy .xls path. The commit fixed only the row, cell and shared-string loops. |
| 3 | Low | Any role with "edit" can change the supplier beneficiary account name (`supplier_account_name`). Since 61dfe2b, sending only that field also renames `supplier_name`. |
| 4 | Low | Resending an unchanged bank part without `bank_details` wipes the `bank_details` text for an admin, and is wrongly refused for a non-admin. This regression is new in 61dfe2b. |
| 5 | Low | A legacy (flat) go-live high-water mark lets rollback erase new master data. |
| 6 | Info | Notes on design and functionality. None of them bypasses the bank-details rule. |

No regression was found in the CSV formula guard (section 7).

---

## 1. Medium: go-live rollback without a high-water mark erases live work

**Where:**
- `goLiveService.js`: `failGoLiveWithRollback` (new condition) and `assertGoLiveRollbackSafe` (`if (!entry?.highWater) return;`).
- `main.js`: the `go-live:rollback` handler.

**What changed.** Before 61dfe2b, a run with no `resetResult` was always refused. Now it is refused only when `resetFailed` is set or the status is `failed`. A run left `in_progress` without `resetResult` is allowed through, which is meant for a run whose reset finished but whose history update was lost.

**The problem.** `highWater` is written in the same `updateGoLiveEntry` call as `resetResult`. Any run that lost that write has no mark, and `assertGoLiveRollbackSafe` returns early when there is no mark. So the one case the new rule lets through is exactly the case with no protection. The rollback then restores the pre-go-live backup over everything entered since.

The state arises when the history write or a step before it fails:

- a locked history file or a full disk on the `updateGoLiveEntry` after the reset;
- `rebuildZeroState` throwing;
- a crash between `recordGoLiveEntry` and the end of the reset;
- the reset failing and the `status: "failed", resetFailed: true` write also failing. In this case the books were never touched, users carry on working, and a later rollback wipes their work.

**Reproduction** (`probe3.test.mjs`, test 1):

1. As admin, call `backup:create`.
2. Write `go-live-history.json` as `{nextId:2, entries:[{id:1,status:"in_progress",backup:{fileName}}]}`.
3. Call `records:create suppliers {supplier_name:"Post go-live supplier"}`.
4. Call `go-live:rollback {goLiveId:1}`.

Result: `rollback: true`, and the supplier count afterwards is `0`. A `pre_restore_*.db` safety copy is kept, so the data can be recovered by hand.

**Who can do it.** Only a role with `restore_backup` (admin). The safety copy limits the impact, but this guard exists to stop exactly this admin mistake.

**Fix.** Write the high-water mark into the `in_progress` entry at `recordGoLiveEntry` time, before the reset (`auditId` plus table max ids). Any later growth outside the reset's own audit rows then refuses the rollback. Alternatively, refuse a rollback that has no mark unless the operator types an explicit override.

## 2. Medium: xlsx and xls parser denial of service is only partly fixed

The commit swapped the `<row>`, `<c>`, `<si>` and `<t>` regexes for a linear `indexOf` walker, and that part works: 2,000,000 unclosed `<row><c>` tags parse in 75 ms. Three other patterns in the same parser still freeze the Electron main process, and with it every window. They are reachable through `imports:parse-buffer` (the import permission, which data_entry_operator has) and `imports:parse-file`.

| Vector | Code | Input | Time |
|---|---|---|---|
| a. Quadratic `<sheet` scan | `parseXlsx`: `/<sheet[^>]*r:id="([^"]+)"/.exec(workbook)` | `xl/workbook.xml` = `"<sheet "` x 20,000 / 40,000 / 80,000 | 3.4 s / 13.5 s / 54 s. The 80,000 case is a 1,187-byte .xlsx. The 64 MB inflate limit allows far more. |
| b. Regex injection (exponential) | `new RegExp(\`<Relationship[^>]*Id="${firstSheetId}"…\`)`, where `firstSheetId` comes from the file | workbook `<sheet r:id="(a+)+$"/>`, rels `<Relationship Id="aaa…a!` | 27 a's: 37 ms. 30: 277 ms. 33: 2.2 s. Each extra `a` roughly doubles the time, so about 45 a's is hours. The file is 531 bytes. |
| c. Lazy regex, legacy .xls | `parseHtmlTable`: `/<tr[^>]*>([\s\S]*?)<\/tr>/gi`, the pattern the commit itself names as the DoS | `"<tr>"` x 20,000 / 40,000 / 80,000 as `a.xls` | 0.64 s / 2.2 s / 8.7 s. Quadratic, so a 25 MB file runs for hours. |

**Reproduction:**

```
cd /tmp/audit61-security
node redos.mjs workbook 80000
node redos.mjs rels 33
node redos.mjs xls 80000
```

**Fix:**
- Read the sheet's `r:id` with the new `forEachElement(workbook, "sheet", …)` walker.
- Find the matching `Relationship` by walking the elements and comparing attribute strings. Never build a `RegExp` from file text; escape it if you must.
- Port `parseHtmlTable` to `forEachElement` for `tr`, `td` and `th`.

## 3. Low: the supplier beneficiary account name is not gated, and editing it renames the supplier

`supplier_account_name` (the beneficiary name) is not in `BANK_FIELDS.suppliers`, so any role with "edit" can change it.

New in 61dfe2b: `supplier_account_name` is listed as an alias of `supplier_name`, and `withStoredFields` drops the stored `supplier_name` when only an alias is sent. As a result, `{supplier_account_name: "Mallory Traders"}` also renames the supplier. The stored `bank_details` text keeps the old account name, so the text and the columns now disagree.

**Reproduction** (`probe.test.mjs`): as data_entry_operator, call `records:update suppliers <id> {supplier_account_name:"Mallory Traders"}`.

Result: ok, and the diff is `supplier_name` and `supplier_account_name`, both now "Mallory Traders". Generic import with `update_existing` and `{supplier_code, supplier_account_name:"Mallory"}` is also accepted.

**Impact.** Bank payments here are matched by account number and IFSC, and nothing in the codebase builds a payout file from this field. The rename side effect is an integrity bug.

**Fix:**
- Add `supplier_account_name` to the gated supplier fields, or document why it is excluded.
- Do not treat a stored column (`supplier_account_name`) as an alias that clears `supplier_name` on update.

## 4. Low: resending an unchanged bank part without `bank_details` wipes the bank text (regression)

`withStoredFields` drops the stored `bank_details` whenever any bank part is sent, whether or not it changed. `supplierBankPartsChanged` then decides correctly that nothing changed and turns off `composeBankText`. Nothing restores the text, so `bank_details` is written as `""`.

**Reproduction** (`probe2.test.mjs`): as admin, call `records:update suppliers <id> {supplier_account_number:"123", remarks:"x"}`, where the stored number is already `123` and `bank_details` holds `"Account Number: 123 (verified by phone)"`.

Result: ok, `bank_details` is now `""`, and a `bank_details_changed` audit row is written. For a data_entry_operator the same payload is refused with "Permission denied: settings", including the variant that differs only by whitespace (`" 111122223333 "`). That is a false refusal on a no-op edit.

The main supplier form sends `bank_details`, so the form is not affected. Partial callers are, such as scripts or future screens.

**Fix.** In `withStoredFields`, delete `stored.bank_details` only when a part actually changes. Reuse `supplierBankPartsChanged`.

## 5. Low: a legacy go-live mark does not see master changes

For history entries written before 2026-10-23 (a flat map of 5 tables), only vouchers, invoices, payments, procurements and stock_ledger are compared, and the audit check is skipped. This is stated in the code. As a result, suppliers created after go-live (including bank details an admin entered) are erased by the rollback.

**Reproduction** (`probe3.test.mjs`, test 2): result `rollback: true`, `stillThere: 0`.

**Fix.** For legacy marks, either refuse the rollback or fall back to comparing the audit log against the backup's newest audit id.

## 6. Info

- **Company bank masters (by design).** Any role with "create" can add a company bank master with any account number (`GATED_ON_CREATE` excludes `banks`), and can quick-create one. These accounts are not printed on invoices today. If a future invoice template prints a "pay to" bank from `banks`, this becomes a money-routing path.
- **Generic import rollback** needs "delete" (admin). It soft-deletes created suppliers and companies directly, bypassing `deleteRecord` and its company-delete bank gate, and it checks references only for `items`. It cannot be run by accountant or data_entry_operator.
- **`undefined` on update.** Sending an explicit `undefined` for a field (structured clone keeps it) overrides the stored value through `{...stored, ...payload}` and blanks it. The guard catches this for bank fields, so it is refused rather than a bypass, but it contradicts "omitted keeps".
- **Stale text after an admin change.** When an admin changes bank parts through master-data import, or through a generic import update that carries the stored `bank_details`, the free text is not rebuilt and keeps the old account. This predates 61dfe2b. Consider rebuilding it, or showing parts and text side by side.
- **Actor.** `runAsActor` with an id-less user gives `{id:null}`, which fails closed in `enforcePermission`. The `currentActor` variable in `main.js` (used by `actorId()`) is still sync-scoped, but every `guarded` handler that uses it is synchronous.
- **Rollback cannot be blocked by others.** `audit:context` writes `table_name = 'ui_context'`, and a viewer's logins, feedback and error-console records do not grow any book table (probe: only `users`, `ui_context` and `security`, all ignored). A low-privilege user cannot block a rollback this way. A user with create permission entering real work blocks it, which is intended.
- **Go-live history.** `isValidHistory` is stricter, but old files always had integer ids, so upgrades are not blocked. Atomic write plus `.bak` is sound. A read-only `go-live:history` call still renames an invalid file aside; this predates 61dfe2b.
- **Audit chain.** The audit chain is now required for go-live verification. Rows are hashed from their stored values, and rolled-back transactions also roll back `sqlite_sequence`, so a user cannot create a false "broken" or "missing newest rows" through the IPC.

## 7. CSV formula guard: no regression

`csvCell` now doubles a leading apostrophe instead of passing the value through `neutralizeFormula`. A cell that starts with `'` is never evaluated as a formula by Excel or LibreOffice, so exports are no less safe.

`importValue` strips exactly one apostrophe before `= + - @ '`, so stored `=SUM`, `'Gold` and `''x` all round-trip unchanged. Two minor notes:

- A hostile CSV can still store a raw `=…` value through master import, which strips `'=` to `=`. This is not new. It is safe as long as every export path neutralizes formulas.
- The renderer's copy of the rule (`src/renderer/utils/formatters.js`) was not updated to double apostrophes. A renderer-exported `'=x` comes back as `=x` on master import. This is a data-fidelity issue only.

## Bank-details probes that were refused (all correct)

Every probe below was run as data_entry_operator or accountant, against a supplier, employee or company that already had bank details:

- **Supplier updates:**
  - `bank_details` set to `""`, `null` or new text;
  - `supplier_account_number: undefined`;
  - an alias `account_number` set to a new value;
  - an alias `bank_name: ""`;
  - `beneficiary_ifsc_code`;
  - `upi_id: null`;
  - whitespace-only part changes.
- **Employee updates:** `account_number: null`, `branch: ""`. Partial employee edits were allowed, and the bank fields kept their values.
- **Master-data import:**
  - a file without the bank columns (it would blank them, so it was refused);
  - a duplicate `account_number` / `Account Number` header;
  - apostrophe-prefixed account numbers.
- **Generic import with `update_existing`:** `bank_details` only, and the `beneficiary_*` aliases.

These were allowed and changed no bank field: master-data import with identical bank values, label headers, or a code that differs only by case or whitespace.
