# Correctness audit of commit 92071b3

- Repo: gii-gem-erp
- Diff reviewed: `git diff 61dfe2b 92071b3`, plus the callers of the changed code
- Date: 2026-10-22
- Scratch probes: `/tmp/audit92-correctness/` (`probe-golive.mjs`, `probe-supplier.mjs`, `probe-parser.mjs`, `probe-xls-scaling.mjs`). They run with plain `node` against the repo. `old61/` holds the 61dfe2b parser, used for old-against-new comparisons.
- The repo was not changed.

## Overall rating: Medium

`npm run test:integrity` passes: 85/85 node tests and 19/19 IPC tests (log: `/tmp/audit92-correctness/integrity.log`).

Most claimed fixes reproduce as fixed:
- A lost-mark rollback is guarded.
- Read-only audit rows no longer block rollback.
- A bank part resent unchanged keeps `bank_details`.
- `supplier_account_name` alone no longer renames the supplier.
- The three parser DoS vectors named in the security audit are gone.

Two Medium problems remain:
- The new `resetAuditIdFor` accepts any `operational_reset` row and picks the newest one. A manual reset after the go-live therefore moves the mark forward, or invents a reset that never happened. Rollback is then allowed and erases live work.
- The legacy .xls path is still quadratic. The tag strip inside each cell is the cause, so the claim "legacy .xls tables are walked in linear time" does not hold end to end.

| # | Rating | Area | Finding |
|---|--------|------|---------|
| 1 | Medium | goLiveService `resetAuditIdFor` | Any later manual operational reset, for any company, is taken as the go-live's reset. Rollback is allowed and erases work |
| 2 | Medium | importParserService `parseHtmlTable` | The cell tag strip `/<[^>]*>/g` is quadratic: a 320 KB .xls freezes the main process for 71 s |
| 3 | Low | goLiveService (lost-mark path) | The fallback compares no tables, so writes with no audit row (CRAC create, update or delete; order closure) are not seen |
| 4 | Low | crudHelpers `withStoredFields` | Prior finding 4 is only partly fixed: `account_name` or `beneficiary_account_name` sent alone still renames the supplier |
| 5 | Low | goLiveService | Carried over: prior findings 5 (the failure write masks the reset error) and 6 (new tables and `users` rows count as changed) are untouched |
| 6 | Low | goLiveService `READ_ONLY_AUDIT_ACTIONS` | `bank_statement_direct_post_blocked` is a refusal that is not listed, so it still blocks rollback |
| 7 | Info | crudHelpers | Contradictory field-plus-alias payloads still blank `bank_details` |
| 8 | Info | goLiveService (legacy path) | A legacy mark with no matching reset row silently skips the audit check instead of refusing |
| 9 | Info | importParserService | Behaviour differences from 61dfe2b: two are improvements and two are minor edge changes |

---

## Verification of the claimed fixes

Each line reruns the original probe, or a new probe where noted, against 92071b3.

**61dfe2b correctness audit**

| Prior finding | Status | Evidence |
|---|---|---|
| 1. No guard without a high-water mark | Fixed for the stated cases. See new finding 1 for the remaining hole | `probe3.mjs` G1: "has no record of a reset in the books" refusal. `probe-golive.mjs` L1: after a real `executeEnhancedReset` and `rebuildZeroState` with a lost mark, rollback is allowed; after a supplier is created it is refused. Security `probe3.test.mjs` test 1 through IPC: refused, the supplier survives |
| 2. Read-only actions block rollback | Fixed | `probe2.mjs`: a real `drilldownData`, a `document view` row, `runProductionVerification`, `completeGoLive` and a restart are all allowed. The listed action strings match the writers (init.js:1300, main.js:1021/1036, masterDataToolsService.js:413). `permission_denied` and `ui:*` are always written with `table_name` `security` or `ui_context`, so excluding them is a no-op but harmless |
| 3. An unchanged bank part blanks `bank_details` | Fixed | `probe1.mjs` P2: `bank_details` is kept. `probe3.mjs` P2: the non-admin save succeeds. Security `probe2.test.mjs`: the admin resend keeps "Account Number: 123 (verified by phone)". A whitespace-only resend is also kept (`trim`) |
| 4. Alias renames the supplier | Partly fixed (new finding 4) | `probe1.mjs` P1: `supplier_account_name` alone no longer renames. `probe3.mjs` P1b: `{supplier_account_name:""}` now falls back to the supplier name |
| 5. `.bak` and failure-write masking | Consequence closed, root cause not fixed | Restoring `.bak` now leads into the lost-mark guard, not an unguarded rollback. The catch block at goLiveService.js:100-105 is unchanged, so a throwing failure write still hides the reset error |
| 6. All-tables mark | Not changed | `compared = Object.keys(now.tables)` and the `users` rule are as before |

**61dfe2b security audit**

| Prior finding | Status | Evidence |
|---|---|---|
| 1. Go-live without a mark | Fixed (as correctness #1 above) | |
| 2a. Quadratic `<sheet` scan | Fixed | `redos.mjs workbook 80000`: 4 ms, was 54 s. 2,000,000 tags: 58 ms |
| 2b. Regex built from file text | Fixed | `redos.mjs rels 33`: 1 ms, was 2.2 s. 60 a's: 2 ms. The id is now compared with string equality |
| 2c. Lazy `<tr>` regex in .xls | Fixed for the row walk | `redos.mjs xls 80000`: 33 ms, was 8.7 s. It scales linearly up to the 25 MB cap: 1M/2M/4M tags take 1.4/2.0/3.5 s. The cell content strip is still quadratic (new finding 2) |
| 4. Bank text wiped on resend | Fixed | As correctness #3 |
| 5. Legacy mark misses master changes | Fixed for real entries | `probe-golive.mjs` L5: a legacy mark plus a real reset row refuses after a supplier is created. Security `probe3.test.mjs` test 2 still erases the supplier, because its synthetic entry has no `generatedAt` and no reset row (see finding 8) |

---

## 1. Medium: `resetAuditIdFor` takes any later operational reset as the go-live's reset

**Code:** goLiveService.js:185-189.

```js
SELECT id FROM audit_log WHERE action = 'operational_reset' AND created_at >= ? ORDER BY id DESC LIMIT 1
```

There is no filter on `module = 'go_live_preparation'`, which is what `executeEnhancedReset` writes (operationalResetService.js:336). There is no company filter. The query also picks the newest matching row, not the first one after `generatedAt`. A manual `reset:execute` writes the same action with `module = 'operational_reset'`, and it only clears transactions. Masters such as suppliers survive it.

**Failure scenarios** (both need admin `system_reset` and `restore_backup`):
- **(a) Stuck run, then a manual reset.** A go-live dies before or inside its reset, and the failure write is also lost (cases (a) and (b) of the prior finding 1). The entry stays `in_progress`, and the books are unchanged. The firm keeps working. Later an admin runs a manual operational reset, perhaps of a demo or second company. "Roll back" on the stuck go-live now finds that reset row, treats it as the go-live reset, and checks only audit rows after it. All masters entered since go-live, and any transactions from before the manual reset, are erased by the pre-go-live restore.
- **(b) Lost or legacy mark, then a manual reset.** Work entered between the real go-live reset and the later manual reset falls before the newer mark, so it is not seen.

**Repro:** `node /tmp/audit92-correctness/probe-golive.mjs`

| Case | Before the manual reset | After `executeReset` |
|---|---|---|
| L4: stuck run, no go-live reset, a supplier entered | `refused: … has no record of a reset in the books` | `ALLOWED` |
| L3: lost mark, a real go-live reset, a supplier entered | `refused: suppliers changed` | `ALLOWED`, and the supplier is still in the live database, so the restore would erase it |
| L5: legacy flat mark, a supplier entered | `refused: suppliers changed` | `ALLOWED` |

The new regression test (audit2-regressions.test.mjs:113) writes the reset row with `module: "go_live"`. It would not catch a module filter being missing or wrong.

**Fix:**
- Match `module = 'go_live_preparation'`, and take the first row, `ORDER BY id ASC LIMIT 1`.
- Refuse if more than one `operational_reset` row (of any module) exists after `generatedAt`, or if any reset row comes after the chosen one. The books then no longer match the go-live's history.
- Use the real module value in the test.

## 2. Medium: legacy .xls cell text strip is quadratic

**Code:** importParserService.js:70: `rowBody.slice(tagEnd + 1, end).replace(/<[^>]*>/g, " ")`. For a cell body with many `<` and no `>`, each `<` scans to the end of the cell, which is O(n²). The row and cell walkers around it are now linear, so this one line dominates. The code predates 92071b3: the 61dfe2b parser takes 4.5 s on the same 80 KB input. The commit's claim that legacy .xls tables are walked in linear time therefore does not hold, and security finding 2 is still open for .xls.

**Repro:** `node /tmp/audit92-correctness/probe-parser.mjs`, timing section. The input is `a.xls` = `<tr><td>` + `"<"` × N + `</td></tr>`.

| N | Time |
|---|---|
| 20,000 | 284 ms |
| 80,000 | 4.25 s |
| 320,000 | 70.8 s |

Extrapolated, 1 MB takes about 12 minutes, and the 25 MB cap allows days. It is reachable through `imports:parse-buffer`, which `data_entry_operator` can call, and it blocks the Electron main process and every window with it.

**Fix:** use `/<[^<>]*>/g`, which stops at the next `<` and so is linear (80,000 `<` takes 1 ms), or strip tags with an `indexOf` loop. Add the input above to the "refused quickly" IPC test.

## 3. Low: the lost-mark fallback sees only audited writes

**Code:** in the `else` branch, `mark = { tables: {}, auditId: reset }` and `compared = []`. Only `audit_log` rows can block the rollback. `guarded()` writes no audit row of its own. Some writers write no audit row either:
- `crac:create`, `crac:update` and `crac:delete` (cracService.js);
- `markOrderOperationallyClosed`;
- `accountMappingRegistry`.

**Repro:** `probe-golive.mjs` L2. A lost mark, a real reset, then `createCracRecord`, which adds 0 audit rows, gives `ALLOWED`. The control with a full mark refuses with "crac records changed".

**Impact:** CRAC certificates entered after the go-live are erased without warning. Usually other audited work is entered alongside them and blocks the rollback, hence Low.

**Fix:** in the fallback, read per-table `MAX(id)` from the go-live backup file (`entry.backup.fileName`, read-only). The reset only deletes, so any table whose live `MAX(id)` is above the backup's has new rows. Keep the audit-row check for edits. Alternatively, audit CRAC and order-closure writes.

## 4. Low: `account_name` or `beneficiary_account_name` alone still renames the supplier

**Code:** the new filter skips only aliases that are themselves keys (`supplier_account_name`). `account_name` and `beneficiary_account_name` still delete the stored `supplier_name` when they are sent without it.

**Repro:** `probe-supplier.mjs`. The stored values are name "Prime Industrial Suppliers" and account name "PRIME IND SUPP A/C".
- S1 `{account_name:"X"}`: `supplier_name` becomes "PRIME IND SUPP A/C", the stored account name. The sent "X" is ignored.
- S2 `{beneficiary_account_name:"Y"}`: `supplier_name` and `supplier_account_name` both become "Y".

**Reach:** only direct partial IPC payloads, as before. MasterScreen and import send `supplier_name`.

**Fix:** on update, never let an alias stand in for `supplier_name`. Map `beneficiary_account_name` and `account_name` to `supplier_account_name` instead.

## 5. Low: carried-over findings not addressed

- **Prior 5:** `executeGoLiveReset`'s catch still calls `updateGoLiveEntry` without its own try/catch. A failing history write replaces the real reset error and leaves the entry `in_progress`. With finding 1 above, that stuck entry plus a later manual reset is exactly the dangerous state.
- **Prior 6:** a new-format mark still compares every current table. A table added by a migration counts from 0, and new `users` rows count as changed.

## 6. Low: one refusal action is missing from `READ_ONLY_AUDIT_ACTIONS`

`postApprovedBankImport` always writes `bank_statement_direct_post_blocked` (table `bank_statement_imports`) and then throws (bankReconciliationService.js:551). A press of the disabled direct-post button after go-live therefore blocks rollback with "bank statement imports changed". The deny list will drift as new read-only or refusal audits are added.

**Fix:** add this action, or better, mark read-only and refusal audits with a column or module and filter on that.

## 7. Info: contradictory supplier payloads still blank `bank_details`

`differs()` looks at the field and its alias separately, but normalisation lets a sent field win over its alias. Two payloads (admin) show the effect, from `probe-supplier.mjs`:
- S5 `{supplier_account_number: <same>, account_number:"999"}`
- S6 `{supplier_account_number:"", account_number: <same>}`

In both, `bank_details` becomes `""` while the parts are unchanged. A non-admin sending the same payload would be refused. No screen sends such payloads.

**Fix:** decide on deletion with `supplierBankPartsChanged(normalizePayloadForTable(...))` on the merged row instead of on raw keys.

## 8. Info: the legacy path fails open when no reset row is found

For a flat legacy mark, `resetAuditIdFor` returning `null` means `mark.auditId = null`, so the audit check is skipped silently. This is the old behaviour. Security `probe3.test.mjs` test 2 still shows `rollback: true, stillThere: 0`, but only because its synthetic entry has no `generatedAt`. Real entries always have one, and the reset always writes its row (L5 refuses).

Consider refusing in this case, as the lost-mark branch does.

## 9. Info: parser behaviour differences from 61dfe2b

These come from `probe-parser.mjs`, which compares the old and new parsers on the same input.

Improvements:
- A `Relationship` with `Target` before `Id` now resolves to the right sheet. The old code read sheet1.
- A sheet id with regex characters (`rId.1`) now matches exactly. The old code matched `rIdX1`.

Unchanged:
- Upper-case and mixed-case tags.
- `<thead>`/`<tbody>`.
- Attributes on new lines.
- The Excel HTML export.
- Nested markup.
- `rId10` against `rId1`.
- An absolute `/xl/` target.
- A non-self-closing `<sheet>`.
- The `x:` prefix, still unsupported.
- `</td >` with a space, still unsupported.
- Omitted `</td>`, still unsupported.

Edge changes:
- A cell opened `<th>` but closed `</td>` now ends the row walk, and the file yields `[]`. The old code accepted it. Excel does not write this.
- When the first `<sheet>` has no `r:id`, the new code falls back to `worksheets/sheet1.xml`. The old code used the first sheet that has an `r:id`.

The other new walkers have no remaining hotspot. These inputs all finish in 27 ms or less:
- huge `<sheet>` attributes;
- 320,000 `<Relationship` elements;
- `<` floods in shared strings;
- `<td` with no `>`;
- `<TR ` floods on the case-folding path.

## Other checks that passed

- **Time comparison.** `generatedAt` (`toISOString`) and `audit_log.created_at` (auditLog writes `toISOString().replace("T"," ").slice(0,19)`) are both UTC at second precision. Truncating `generatedAt` keeps a reset in the same second (L6). A clock moved backwards makes the lookup fail closed in the lost-mark branch.
- **Lost-mark false refusals.** None after a real reset plus `rebuildZeroState` (L1).
- **`/deployment/` ignore and removal of `certificate-history.json`.** `certificationService.readHistory` handles a missing file, and nothing reads the file from the checkout. The ignore rule is anchored at the root, so `src/main/services/deployment/` is unaffected.
- **Bank-detail gate.** The security `probe.test.mjs` variants all keep the expected outcomes.
