# Security audit of commit 92071b3

- **Date:** 2026-10-22
- **Scope:** `git diff 61dfe2b 92071b3`, read against the whole IPC surface (`src/main/main.js`, crudHelpers, bankDetailsPolicy, go-live and operational reset, audit log, import parser).
- **Method:** code review, plus probes through the real IPC handlers using the `scripts/audit/ipc-security.test.mjs` harness pattern. Nothing in the repo was changed.
- **Probes:** in `/tmp/audit92-security/`.
  - `supplier.test.mjs`, `rollback.test.mjs`, `legacy.test.mjs`, `md.test.mjs` and `dos-ipc.test.mjs` go through IPC.
  - `dos2.mjs` and `redos.mjs` call the parser directly.
  - The 61dfe2b probes (`probe*.test.mjs`) were re-run.

**About the working tree.** During this audit the checkout at `/home/claude/gii-gem-erp` picked up uncommitted edits to `goLiveService.js` and `audit2-regressions.test.mjs`, made by another session. To test the commit itself, every probe runs against a clean export of 92071b3 (`git archive 92071b3`) in `/tmp/audit92-security/src92`. The uncommitted edits were not audited. Some of them appear to address finding N1 (they filter by module and company, and pick the first reset row instead of the last).

Run a probe with:

```
cd /tmp/audit92-security/src92
node --import ./scripts/audit/lib/electron-register.mjs --test /tmp/audit92-security/rollback.test.mjs
```

## Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| N1 | **Medium** | When a run's high-water mark was lost, the rollback check uses the **latest** `operational_reset` row of **any** company or module. An ordinary reset after go-live therefore hides all earlier live work, and the rollback erases it. | New in 92071b3 |
| N2 | **Medium** | A crafted xlsx, csv or xls can still freeze the main process. The cost of parsing grows with header width times row count: an 82 KB xlsx blocks the main process for 11.6 s through IPC as data_entry_operator. The cell-tag strip in the HTML .xls path is quadratic. | Not new, still open |
| N3 | Low | CRAC writes leave no audit row. `crac:update` is invisible to the rollback check even when the mark is present. With a lost mark, `crac:create` is invisible too. | Not new; made wider by the fallback |
| 1 (old) | Medium | Rollback with no high-water mark | **Mostly fixed.** The original reproduction is now refused. See N1 for what is left. |
| 2 (old) | Medium | `<sheet` regex, regex injection, lazy `<tr>` regex | **Fixed.** All three now run in linear time. See N2. |
| 3 (old) | Low | Beneficiary name not gated; editing it renames the supplier | **Partly fixed.** `supplier_account_name` alone no longer renames, but `beneficiary_account_name` and `account_name` still do. The field is still not gated. |
| 4 (old) | Low | Resending an unchanged part wipes `bank_details` | **Fixed** for the reported case. An edge case remains when a field and its alias disagree (N4). |
| 5 (old) | Low | A legacy mark does not see master changes | **Fixed** for real legacy entries. N1 also applies to them. |
| N4 | Low | Field and alias sent with values that disagree: an admin wipes `bank_details`, and a non-admin is wrongly refused | Left over from old 4 |
| N5 | Info | The bank guard trims values but the write does not. A non-admin can pad a gated value with whitespace (newline, NBSP, BOM). Master-data import of the clean value is then refused for them. | New behaviour (61dfe2b refused this edit) |
| — | Info | Forging, blocking, string ids, history | See section "Info" |

**Bank details.** No way was found for an accountant or a data_entry_operator to set, change or wipe a gated bank field. The gated fields are account number, bank name, IFSC, branch, UPI and the `bank_details` text. Supplier partial updates were tried with aliases, `null`, `""`, a no-op resend, a field and alias that disagree, and an empty field with an alias. All 61dfe2b bypass probes were re-run. All were refused, or were allowed only when nothing gated changed.

**Forging the reset row.** A non-admin cannot forge or suppress an `operational_reset` audit row:

- Only `performCompanyReset` writes one, behind `system_reset`, which admin and super_admin have.
- `audit:context` prefixes `ui:` and fixes `table_name = 'ui_context'`.
- `enforcePermission` fixes `action = 'permission_denied'`.

Every rollback-erasure path found needs an admin to run the rollback.

---

## N1. Medium: with a lost mark, a later reset of any company moves the rollback mark past live work

**Where:** `goLiveService.js` in 92071b3.

```js
function resetAuditIdFor(db, entry) {
  const since = String(entry.generatedAt || "").slice(0, 19).replace("T", " ");
  ...
  return db.prepare("SELECT id FROM audit_log WHERE action = 'operational_reset' AND created_at >= ? ORDER BY id DESC LIMIT 1").get(since)?.id || null;
}
```

`assertGoLiveRollbackSafe` uses this row as the mark when the entry has no `highWater` (the fallback branch, with `compared = []`), and also for legacy flat marks. Three problems:

- The query takes the **newest** reset row (`DESC`), not the run's own reset.
- It does not filter on `module = 'go_live_preparation'`, so an ordinary `reset:execute` row matches.
- It does not filter on company. Resets are per company (`performCompanyReset`), but the rollback restores the **whole** database.

As a result, any ordinary reset after go-live becomes the new mark. Live work audited before it is ignored, and rollback restores the pre-go-live backup over it. Examples are clearing a training or demo company, or re-clearing a company.

A second case uses the same mechanism. The go-live reset failed, and the `failed`/`resetFailed` history write was lost too, so the entry still reads `in_progress` with no mark. Before any reset, the rollback is correctly refused ("no record of a reset"). After any later ordinary reset it is allowed, and it erases everything since the go-live attempt.

**Reproduction** (`rollback.test.mjs`, test A):

1. As admin, call `backup:create`.
2. Write the history as `{id:1, status:"in_progress", generatedAt:<now>, backup:{fileName}}`, with no `highWater`, to simulate the lost update.
3. Call `reset:execute {company_id:1, confirm_text:"RESET"}` (the go-live reset). The check is **allowed**, which is correct.
4. As data_entry_operator, call `records:create suppliers {supplier_name:"Live Work Supplier"}`. The check is **refused** ("suppliers changed after go-live"), which is correct.
5. As admin, create company 2. The check is still refused.
6. As admin, call `reset:execute {company_id:2, confirm_text:"RESET"}`. The check is now **allowed**.
7. Call `go-live:rollback {goLiveId:1}`. Result: `success: true`. Afterwards the "Live Work Supplier" count is **0**, and company 2 is gone as well.

A `pre_restore_*.db` safety copy is kept, so the data can be recovered by hand.

**Who can do it.** Only an admin can run it: both the reset and the rollback need admin. It also needs a lost mark. The guard exists to stop exactly this admin mistake, and the fallback was added in this commit to cover the lost-mark case.

**Fix:**

- Store `auditIdAtStart` (the newest audit id) in the `in_progress` entry at `recordGoLiveEntry` time.
- Pick the **first** row after it with `module = 'go_live_preparation'`, plus a company match when the company is known.
- Better still, write the full `bookHighWater` mark into the `in_progress` entry before the reset. The fallback can then also compare table max ids.

## N2. Medium: the import parser can still freeze the main process (header width times row count)

The three vectors from 61dfe2b are fixed and now run in linear time:

| Vector | Before (61dfe2b) | Now |
|---|---|---|
| `<sheet ` x 80,000 | 54 s | 3 ms (x 2,000,000: 38 ms) |
| Injected `(a+)+$` with 60 a's | hours | 1 ms |
| `<tr>` x 2,000,000 (8 MB .xls) | hours | 1.2 s |
| `<tr>` x 6,000,000 (24 MB) | — | 4.4 s (linear) |

All four parsers still have a multiplicative cost:

- **The blow-up.** Every data row is turned into an object with one key per header column: `Object.fromEntries(headers.map(...))`. A file with a wide header and many short rows does `width x rows` work, and the input is small.
  - `parseXlsx` caps columns at 16,384 and cells at 2,000,000. That still allows about 16,384 x 1,980,000 key writes, which means hours or an out-of-memory crash.
  - `parseCsv` and `parseDelimited` (the .xls tab-separated fallback) have no column cap.
  - `parseHtmlTable` has none either.
- **The quadratic strip.** In `parseHtmlTable`, each cell runs `.replace(/<[^>]*>/g, " ")`. A cell made of many `<` with no `>` costs O(n²). This regex was there before 92071b3 and was not flagged in the last audit.

**Reach.** Both are reachable through `imports:parse-buffer`, which needs the import permission (data_entry_operator and accountant have it). They are also reachable through `imports:parse-file`, which needs only a file the user picked in the dialog and has no role check.

| Input | Size | Time |
|---|---|---|
| xlsx: 16,384 header columns, 1,000 one-cell rows | 82 KB | 4.3 s |
| xlsx: 16,384 header columns, 4,000 rows | 83 KB | 28 s |
| **IPC** `imports:parse-buffer` as data_entry_operator: 16,384 columns x 2,000 rows | 82.5 KB | **11.6 s, 0 timer ticks** (event loop fully blocked) |
| csv: 16,384 distinct headers, 1,000 rows | 105 KB | 5.0 s |
| csv: 65,536 headers, 1,000 rows | 450 KB | 27 s |
| xls (tab-separated): 16,384 headers, 1,000 rows | 105 KB | 4.5 s |
| xls (HTML): 16,384 `<td>` headers, 1,000 rows | 254 KB | 4.2 s |
| xls (HTML): one cell of 40k / 80k / 160k `<` | 40 / 80 / 160 KB | 1.1 / 4.4 / 17.7 s (quadratic, so 1 MB is about 11 min) |

**Reproduction:**

```
cd /tmp/audit92-security
node dos2.mjs xlsxwide 16384 4000
node dos2.mjs csvdistinct 65536 1000
node dos2.mjs htmllt 160000
cd src92
node --import ./scripts/audit/lib/electron-register.mjs --test /tmp/audit92-security/dos-ipc.test.mjs
```

**Fix:**

- Cap the header width in all parsers. About 512 columns is far more than any import template uses.
- Drop empty and duplicate headers before building the row objects.
- Cap total row count times width, or the number of output rows.
- Replace the tag strip with an `indexOf`-based walk, or `/<[^<>]*>/g`, which cannot rescan.
- Consider moving parsing to a `worker_thread` or utility process with a timeout, so no parser bug can freeze every window.

## N3. Low: CRAC writes are invisible to the rollback guard

`cracService.js` writes `crac_records`, and updates `supply_orders` (the `crac_*` columns and `operationally_closed`), with no `auditLog` call. The same is true of `orderClosureService.markOrderOperationallyClosed`.

- **Mark present.** An edit adds no row and leaves no audit row, so `crac:update`, `crac:delete` and `crac:closure-mark` after go-live are not seen.
- **Mark lost.** The N1 fallback compares no table max ids (`compared = []`), so `crac:create` is not seen either. Neither is any other write that skips the audit log.

**Reproduction** (`rollback.test.mjs`, test B):

- With a full mark, data_entry_operator calls `crac:update 1 {remarks, crac_amount:12345}`. The check is **allowed**.
- In fallback mode, data_entry_operator calls `crac:create {...}`. The check is **allowed**.

The rollback then erases these CRAC certificates and amounts, along with the order fields they set.

**Who can do it.** Any role with create or edit can enter the work that gets lost. Only an admin can run the rollback.

**Fix:**

- Audit CRAC create, update and delete, and the closure mark (it also belongs in the audit trail).
- In the fallback, also compare the max id of each table against a mark stored before the reset (see N1).

## Old finding 3, still Low: the beneficiary name is not gated, and two aliases still rename the supplier

92071b3 stops `supplier_account_name` from clearing `supplier_name`. The other two aliases of `supplier_name` still do (`supplier.test.mjs`, run as data_entry_operator and accountant):

| Payload | Result |
|---|---|
| `{supplier_account_name:"Mallory Traders"}` | Only `supplier_account_name` changes (fixed). |
| `{beneficiary_account_name:"Mallory Traders"}` | `supplier_name` **and** `supplier_account_name` both become "Mallory Traders". |
| `{account_name:"Mallory Traders"}` | `supplier_name` becomes the **stored** beneficiary name ("Orig Beneficiary"), and the value sent is dropped. |

`supplier_account_name` is still not in `BANK_FIELDS.suppliers`. The impact is the same as before: payouts match on account number and IFSC, so this is an integrity problem, not a payment redirect.

**Fix:** treat the aliases of `supplier_name` as fallbacks only on create, not on update. Then decide whether to gate the beneficiary name.

## N4. Low: a field and its alias that disagree still wipe `bank_details`

`withStoredFields` deletes the stored text when **any** sent key differs from the stored part. `normalizePayloadForTable` gives the real field priority, so `supplierBankPartsChanged` sees no change and turns composition off. The text is then written as `""`.

**Reproduction** (`supplier.test.mjs`, run as admin against `bank_details = "Account Number: 111122223333 (verified by phone)"`):

- `{supplier_account_number:"111122223333", account_number:"999"}` gives `bank_details` `""`.
- `{supplier_account_number:"", account_number:"111122223333"}` gives `""`.
- `{supplier_bank_name:"SBI", bank_name:"HDFC"}` gives `""`.

For a data_entry_operator the same payloads are refused, which is a false refusal on a write that changes nothing gated.

**Fix:** decide whether a part changed with the same normalized values that will be written. Call `supplierBankPartsChanged(merged-with-stored-text, oldRecord)` before dropping the text, or run `normalizePayloadForTable` first.

## N5. Info: the bank guard trims values, but the write stores them as sent

The guard compares bank values after `trim()`, but `cleanPayload` writes the raw value.

**Reproduction** (`supplier.test.mjs`): data_entry_operator sends `{supplier_account_number:" 111122223333 "}`. Result: allowed, and the stored value is now `" 111122223333 "`. At 61dfe2b this edit was refused, as a side effect of the old wipe.

The same works for any character `trim()` removes: newline, NBSP, U+2028 and BOM. The account digits cannot change. Two side effects:

- A future payout or CSV export would carry the padding. A newline inside a field is a row-injection risk.
- Master-data import of the clean value is then refused for the same user. The re-run 61dfe2b probe hit this: `md:same_bank` was allowed at 61dfe2b and is refused at 92071b3, only because of the padded value stored earlier. With a clean row, master-data import is allowed (`md.test.mjs`).

**Fix:** trim the gated fields when writing them, in both `cleanPayload` and master-data import.

## Old findings 1 and 5 at 92071b3: what the probes show

- **Old 1 reproduction** (`probe3.test.mjs`): an `in_progress` entry with no mark and no reset row. Result: **refused** ("has no record of a reset"), and the supplier survives.
- **Old 5** (`legacy.test.mjs`): a flat legacy mark with `generatedAt` (as `recordGoLiveEntry` always writes it), a reset row, and a supplier created afterwards. Result: **refused** ("suppliers changed").
  - A hand-made legacy entry with no `generatedAt` is still allowed, because the audit check is skipped (`probe3.test.mjs` test 2 and `legacy.test.mjs`). Real entries always have the field, so this is theoretical.
  - The `DESC`/module/company problem from N1 applies to legacy marks too.
- **Read-only actions** (`voucher drilldown access`, `document view`, `document download`, the master-data export and template download, `permission_denied`) and `ui:%`: no write path logs under these actions, so excluding them hides no work. The only writer of `ui:*` is `audit:context`, which always writes `table_name = 'ui_context'`.

## Info

- **Blocking rollback.** A viewer cannot block a rollback (`rollback.test.mjs` test C). The viewer's activity in the probe:
  - `audit:context`;
  - a refused `records:create`;
  - a refused `go-live:rollback`;
  - `accounting:drilldown`;
  - a password change.

  The check stays allowed. Any role entering real work blocks a rollback, which is intended.
- **Blocking go-live.** 92071b3 does not change `go-live:execute`. A non-admin cannot forge, delete or reorder audit rows, so cannot cause the "no record of a reset" refusal. The timestamps in `resetAuditIdFor` and `auditLog` both come from `new Date()` in UTC in the same process, at the same one-second precision, so they cannot disagree.
- **String or unknown `goLiveId`.** `assertGoLiveRollbackSafe` returns quietly when no entry matches, so it fails open. But `failGoLiveWithRollback` uses the same strict `===` lookup and refuses. Probe: `go-live:rollback {goLiveId:"3"}` returns "not found in the go-live history". Failing closed in the assert would be more robust.
- **`imports:parse-file`** has no role check, only "the file was picked in the dialog". Together with N2, a viewer can freeze the app with a file they pick themselves.
- **`deployment/certificate-history.json`** was removed from the repo and `/deployment/` added to `.gitignore`. The removed file holds only test certificate numbers and timestamps, and no secrets.
- **The CSV formula guard** did not change in this commit.
