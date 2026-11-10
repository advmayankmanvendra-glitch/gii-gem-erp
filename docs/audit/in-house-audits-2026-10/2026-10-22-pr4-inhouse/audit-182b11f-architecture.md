# Architecture and Sustainability Audit: commit 182b11f

Repo `/home/claude/gii-gem-erp`, branch `claude/erp-full-automation-qbhv8k`, HEAD `182b11f` ("Address Copilot review and the audits of 6fa5734"). Scope: `git diff 6fa5734 182b11f`, 41 files, +631/-325. Baseline: `audit-6fa5734-architecture.md` (F1–F11). This was a read-only review; nothing in the repo was edited, and the working tree was clean before and after. Scratch probes are in `/tmp/audit-182b11f/`. Written 23 Oct 2026, 03:35 IST.

Checks run:
- `npm run test:integrity` passed: **78/78 Node tests and 18/18 IPC tests**. At 6fa5734 it was 76 + 16.
- `npm run lint:syntax` passed.
- `verify:graph-registry` gave **48 PASS / 1 FAIL**. The failure is the report-manifest integrity check, carried over from before.
- Three scratch probes were run against the real `init.js` and go-live services (`/tmp/audit-182b11f/probe/*.test.mjs`).

Claims marked *(inferred)* come from reading the code and were not run.

## Verdict

**Rating: Sustainable with conditions. Better than 6fa5734: the High finding is closed and no new High was found.**

The main fix is sound. The bank-details policy now runs once, on the row that is actually written:
- `crudHelpers` takes an injected `guardSensitiveWrite` hook, and `init.js` wires it to `bankDetailsPolicy`.
- The alias bypass and the omission bypass from F1 are closed. The new IPC test covers both, and I confirmed it with a probe.
- `main.js` lost three call sites and shrank from 1,436 to 1,414 lines.

AGENTS.md compliance holds:
- No business logic was added to `App.jsx`.
- No IPC channel, preload method or route key was renamed.
- There is no schema change.
- New messages are guided.

What remains is mostly about **where implicit policy decisions are hidden**:
1. The bank gate turns itself off whenever no ambient actor is set. Today that means internal writes, but nothing declares it, so it fails open (N1).
2. The go-live rollback guard does two things:
   - It counts five hand-picked tables, and a probe showed it misses draft expenses and new masters (N3).
   - Its evidence file is now read in a fail-closed way but still written non-atomically (N2).
3. The master-data import still applies the bank policy in `main.js`, with a second field vocabulary and the second actor source (N4).

## New findings

| # | Finding | Sev | Evidence (file:line) | Why it matters | Fix | Effort |
|---|---|---|---|---|---|---|
| N1 | The bank gate turns itself off when there is no ambient actor. "Internal write" is inferred, not declared | **Med** | `init.js:1751-1764`: `if (changes.length && actor) enforcePermission(...)`, where `actor = currentActor()` (the module-global `ambientActor`, `init.js:1601-1615`). `runAsActor` restores the previous actor in `finally` as soon as `fn` *returns*, so any code after an `await` runs with no actor. **Probe:** `runAsActor(deo, async () => { await null; return currentActor(); })` resolves to `null`. Also, `updateRecord` with no actor changed a supplier's account number with no permission check (by design, but silent). No guarded handler is async today (`grep "guarded(.*async"` finds none), so this is a latent risk, not a live one. | The most important money-routing rule now depends on an undeclared global. A future async handler, background job (the alert timer at `main.js:1393`), sync or HTTP channel, or a service called outside `handle` would skip the gate silently, with no error and no test failure. | Make the system path explicit. Add `runAsSystem(fn)`, which sets `{ system: true }`. Have `guardBankDetailWrite` throw a guided error when the actor is `null`, and skip only when `actor.system`. Wrap seeding, migrations, reset and go-live in `runAsSystem`. Add one test that a write with no actor is refused, and one that seeding still works. In the longer term, use `AsyncLocalStorage` so the actor survives `await`. | S |
| N2 | The go-live history is now read fail-closed but still written non-atomically | **Med** | `goLiveHistoryService.js:73-75`: `fs.writeFileSync(path, JSON…)` writes straight over the file. The new reader (`:20-70`) treats any unparsable file as damaged, renames it to `*.corrupt-<ts>` (`:58`), and from then on refuses every read until a person restores it. **Probe:** truncating the file to 40 bytes made the first read throw "was damaged… kept as …", and every later read threw "is missing and a damaged copy was kept". The file also now holds the rollback safety evidence (`highWater`), and it lives in `runtime/deployment/`, which backups do not copy (previous Risk 16). | Fail-closed is the right policy for evidence, but it turns a crash or power cut during a write into a hard stop for go-live and rollback. That needs support help at the moment the client is going live. A *read* that renames files is also an unexpected side effect for callers such as readiness screens. | Write atomically: write `go-live-history.json.tmp`, `fsync`, then `rename`, and keep the previous version as `.bak`. When the main file is damaged, try `.bak` before refusing. Move the "set aside" step out of `readHistory` into an explicit recovery action. Add `runtime/deployment/*.json` to the backup set. | S |
| N3 | The rollback high-water mark covers 5 hand-picked tables and misses drafts and masters. The check also sits in the IPC layer | **Med** | `goLiveService.js:164`: `HIGH_WATER_TABLES = ["vouchers","invoices","payments","procurements","stock_ledger"]`, compared by `MAX(id)`. **Probe:** after recording a high-water mark, I created a draft `expense_entries` row and a new `suppliers` row. `assertGoLiveRollbackSafe` did **not** refuse, so a rollback would erase both. The same applies to draft stock inwards, supplier payments, allocations, documents and every master *(inferred)*. The check is called only from the handler (`main.js:1311`), not from `failGoLiveWithRollback`. It also *throws*, while the service's other four refusals *return* `{ rollbackResult: { success:false, reason } }` (`goLiveService.js:192-197`). | The list will drift: each new transaction table is one more way to lose data on rollback. Two refusal shapes for one operation mean the UI must handle both, and a second caller of the service would skip the data-loss guard. | Use one universal mark. Every CRUD write goes through `auditLog`, so record `MAX(audit_log.id)` after the reset and refuse if any later `create`/`update`/`delete` audit row exists, excluding go-live's own rows. Keep the table list only to say *what* was entered. Fold the status, `resetResult`, latest-run and high-water checks into one `planGoLiveRollback(db, root, id)` that returns a refusal reason while the database is open. Run it in the service and give one refusal shape. | S |
| N4 | The master-data import still enforces the bank policy in `main.js`, with a second field vocabulary and the other actor source | Low-Med | `main.js:977-989` builds a preview, calls `enforcePermission(..., user_id: actorId())` (the `main.js` `currentActor` variable, `:233`), and writes a batch-level `bank_details_changed` row with no old or new values. The records path (`init.js:1753`) uses `init.js` `currentActor()`. `bankDetailsPolicy.js:46-55` judges "updated" rows by **import keys** (`MASTER_IMPORT_BANK_KEYS`, `:21`) and "new" rows by **column names** (`BANK_FIELDS`, `:9`), using the master-data field map (`masterDataToolsService.js:53-57`). The preview is still built twice (here and inside `confirmMasterDataUpdate`). | This is the one remaining second enforcement site, so F2 is not fully closed. A new master key or a renamed import field changes the bank rule silently. Bank-change audit rows for the same supplier have two shapes, depending on which screen made the change. | Pass the same `guardSensitiveWrite` hook into `confirmMasterDataUpdate`. It already has the old row and the `dbField` values for each row (`masterDataToolsService.js:496-510`), so call the hook per row and per column and delete `masterImportTouchesBankDetails` and `MASTER_IMPORT_BANK_KEYS`. The `main.js` handler then has no policy code. | S |
| N5 | The sensitive-write audit is written before the delete outcome is known, and the bank wording is fixed inside a generic hook | Low | `crudHelpers.js:430` writes `bank_details_changed` ("* existing → deleted") **before** `assertSupplyOrderNotLinked`, the referenced-master deactivation and `assertDeleteSafe`, with no transaction. **Probe:** an admin deleting company 1 got `status: inactive` (deactivated, not deleted), but the audit row says "deleted". A delete that throws later still leaves the row *(inferred)*. `auditSensitiveWrite` (`:329-340`) fixes `action: "bank_details_changed"` and `module: "security"` inside `crudHelpers`, while the hook is named `guardSensitiveWrite`. Seeding writes two `bank_details_changed` rows with no user. | The security audit can claim changes that did not happen. The abstraction leaks: the next sensitive field (GSTIN, PAN, UPI) would need `crudHelpers` edits, not just a policy entry. | Have the hook return `{ action, changes }`, or have the policy supply an `audit(change, outcome)` callback. Write the audit row after the outcome, with `deleted` or `deactivated`. Wrap `deleteRecord` in `db.transaction`. Skip the audit for system writes (see N1). | XS-S |
| N6 | The permission refusal does not say that bank details are the reason | Low | The gate reuses `enforcePermission`, whose message is the generic "Permission denied: settings. Your role (data_entry_operator) cannot do this…" (`authService.js:85`). A data-entry user who saves a supplier form that dropped or reformatted the IFSC sees "settings" while editing a supplier. | AGENTS.md §13 asks errors to say *which field* needs attention. Users will escalate this as a bug. | In `guardBankDetailWrite`, catch the error and rethrow it, naming the fields: "Bank details (account number, IFSC) on this supplier can only be set or changed by an admin. Leave them as they were and save again, or ask an admin…". | XS |
| N7 | `desktopOnlyActions` is a third hand-kept preload list, and the proxy's default changed | Low | `client.js:90-119` (28 names) sits next to `blockedPreviewActions` (79) and `browserFallbackApi` (167 keys), set against 164 preload methods. Unknown properties now return `undefined` (`:136`) instead of a rejecting function. **Script check** (`/tmp/audit-182b11f/apis.mjs`): all 28 names exist in preload, none overlap the fallback, and of the 25 preload methods in none of the three lists, none is called without a capability check today. | The list is complete now, but nothing keeps it complete. A new preload method that a screen calls directly will crash browser preview with "x is not a function". This affects preview only, not the desktop app. | Add a test that parses preload and requires each method to be in the fallback, `blockedPreviewActions` or `desktopOnlyActions`, or to be called only behind `?.`, `typeof` or `if (api.x)`. Better still, tag the methods once in preload (for example `{ desktopOnly: true }` metadata) and derive both sets from that. | S |
| N8 | `drilldownFilters.js` is a good extraction, but date filtering for the period now happens in two layers and is untested | Low | `drilldownFilters.js:1-39` is pure and uses `dashboardFilters` (good reuse). However:<br>(a) Billing, Collections and Profit drilldowns filter invoices, payments and procurements **in the renderer** with `inFilterRange`, while `accountingData` already accepts `date_from`/`date_to` (`accountingService.js:1232-1239`) but applies it only to vouchers.<br>(b) `dashboardContext.jsx:30` `readNavContext` duplicates `readDashboardNavContext`.<br>(c) Receivables and Treasury still pass the raw `companyContext` (`ReceivablesDrilldown.jsx:26`, `TreasuryDrilldown.jsx:16`). As-of balances may be intended, but this is not written down.<br>(d) The sessionStorage range persists, so a drilldown opened later from the menu reuses the last dashboard period. It is visible in the strip but easy to miss.<br>(e) `UnpostedDrilldown.jsx:26-27` re-implements the `financialControlReport` "unposted" rule in a component. | Card and drilldown totals reconcile today only because both sides happen to match. The next report that needs "invoices in a period" will pick one of two implementations. | Apply `date_from`/`date_to` to invoices, payments and procurements in `accountingData`, then drop `inFilterRange`, or keep it and unit-test it. Have the server return the unposted list or count. Delete `readNavContext` in favour of the helper. Clear the nav context when a drilldown is opened from the menu. State in a comment that Receivables and Treasury are as-of views. | S |
| N9 | Lazy xlsx reader: the design is good, but there are three readers and the hand-written ZIP code has unguided edge errors | Info | `importParserService.js:107-147` now indexes the parts and inflates each one only when it is read, with per-part (64 MB), total (128 MB), column (XFD) and cell (2 M) caps. The `cache`/`entries` objects only see `xl/…` names, so prototype keys are not reachable. Remaining issues:<br>(a) No bounds check on `localHeaderOffset` (`:133-134`), so a crafted file throws a bare `RangeError` instead of a guided message.<br>(b) No ZIP64 support.<br>(c) Two renderer copies exist (`importParsers.js:62-130`, used by browser preview only, and `fileParsers.js:253`, apparently unused). Neither has the new caps. | The desktop import path is protected. The parallel copies are drift waiting to happen. | Wrap the local-header read in a guided "the .xlsx file is damaged" error. Delete the unused `fileParsers.parseXlsxBufferBrowser` and `unzipXlsxBrowser`. Either share one pure reader, or document that the preview reader is untrusted-input-free. | XS |
| N10 | Core-logic changes that need explicit sign-off under AGENTS.md §4 | Info | The supplier-return posting now splits between Trade Payables and GRNI by **value** (`inventoryService.js:341-366`, `:394-410`). This is a change to "voucher posting math" and "inventory valuation". Bank-detail creation is now gated for companies, suppliers and **employees** (`bankDetailsPolicy.js:18`), which settles F3 one way: HR onboarding by data entry now needs an admin whenever bank details are entered. The supplier `supplier_account_name` field is no longer gated (it is derived from `supplier_name`). | All three are reasonable choices that the owner should approve explicitly, not just accept as review fixes. | List them in the PR for the owner's "go". The GRNI split has a test (`audit2-regressions.test.mjs:141`). | — |

## Previous findings (audit at 6fa5734): status at 182b11f

| # | Finding | Status |
|---|---|---|
| F1 | Bank check reads the IPC payload; alias and omission bypass | **Fixed.** The check runs on `cleanPayload` output in `createRecord`, `updateRecord` and `deleteRecord` (`crudHelpers.js:352`, `:407`, `:430`). It is tested for alias, omission (conditional, see the test gaps), create, employee, `imports:confirm` and master-data "new" (`ipc-security.test.mjs:276-305`). A probe confirmed a data-entry user is refused. |
| F2 | Policy spread over 4 sites and 2 layers; different audit trails | **Mostly fixed.** The records, bulk-import create and bulk-import update paths share one hook that both enforces and audits. `bankDetailDeleteNeedsAdmin` was removed. The master-data import remains a second site with its own audit shape (N4). |
| F3 | Creating a record with bank details was ungated | **Fixed, by a policy choice.** Creation is gated for companies, suppliers and employees; bank masters are open on create and gated on change. Needs the owner's sign-off (N10). |
| F4 | Two parallel "current actor" globals | **Partly.** The policy now reads `init.js` `currentActor()`. The `main.js` `let currentActor` (`:233`) and `actorId()` still exist and are used by the master-data bank check (N4) and about 15 handlers. The ambient actor has no system marker (N1). |
| F5 | CSV formula guard copied three times; main exports unguarded | **Mostly fixed.** There is one copy per process (`domain/csvSafety.js:4`, `formatters.js:25`) and a parity test runs both copies (`audit2-regressions.test.mjs:208-216`). `exportRows`, `feedbackService`, the `MasterDataToolsScreen` report and both error-report writers are now guarded, and the regex now leaves `-1,234.50` and `+91 …` alone. Remaining: the bulk-import (`importValidationService`) re-import does not strip the `'`; only master-data does (`masterDataToolsService.js:254`). The comment "the two processes do not share modules" is a convention, not a constraint: Vite can bundle a pure `src/main/domain` module, and the tests already import both. A `src/shared/csvSafety.js` would remove the second copy. |
| F6 | `assertLinksInCompany` covers only part of the data | **Unchanged** (`bank_account_id`, payment links, supply orders and plans). |
| F7 | Repeated user lookups; double master-data preview | **Unchanged.** The bank gate adds one more `enforcePermission` lookup, but only when bank fields change. |
| F8 | Supplier-return GRNI is all-or-nothing, matched by name, and unindexed | **Partly fixed.** It now splits by value (`returnGrniPortion`, tested). It still matches the account by **name** (`inventoryService.js:361`) and still has no index on `vouchers(source_module, source_id)` and the other columns named in F8. Indexes need approval. |
| F9 | Third date idiom; IST bug in imports | **Partly fixed.** The import date parser now reads the local calendar date (`importValidationService.js:31-34`), and warranty is safe at month end. Still open: `bankReconciliationService.js:119,127-128` (`toISOString().slice(0,10)`). The hand-written add-months logic now has one more copy (`inventoryService.js:123-130`), and none of it moved to `domain/businessDate.js`. No IST test covers the import parser or the warranty month-end case. |
| F10 | New paths tested only on the happy path | **Much better.** Tests now cover alias, create, employee, imports, master-data "new", the bank-master rules, the GRNI split, the go-live high-water and never-reset cases, the xlsx column cap, and neutralize parity. Gaps are listed below. |
| F11 | Lint list and graph registry | **Lint fixed** (`bankDetailsPolicy.js` and `csvSafety.js` added; `lint:syntax` passes). The list is still hand-kept rather than a glob. **Graph registry still FAIL** (1 of 49, report-manifest integrity). |

The previous risk table (Risks 1–16) is unchanged by this commit, with two exceptions:
- **Risk 6** (`init.js` hub): it grew from 2,092 to 2,112 lines because the policy wiring moved there.
- **Risk 16** (runtime JSON not backed up): it now matters more, because the go-live history carries the rollback safety evidence (N2).

`_diagnose.mjs`, an ad-hoc script that wrote to the dev database, was deleted. That is good hygiene.

## Test coverage of the new paths

Covered:
- alias update
- supplier create with and without bank details
- employee update
- `imports:confirm` (create)
- master-data "new"
- bank master create allowed, then change refused, with other fields still editable
- admin bank audit row (`ipc-security.test.mjs:209`)
- GRNI split
- go-live never-reset and high-water refusals
- xlsx column cap
- neutralize parity across both copies

Not covered:
- **Omission wipe on companies.** The assertion is skipped when the seeded company has no bank fields (`ipc-security.test.mjs:288`), so it may never run. It should seed bank values first.
- Master-data **"updated"** rows that change bank details.
- Bulk-import **update** of an existing supplier's bank fields.
- `records:delete` of a company, and its audit row (see N5).
- The no-actor path (N1).
- The corrupt or missing history file paths (N2).
- The xlsx 2 M cell cap, and the lazy read of a multi-sheet workbook.
- `drilldownFilters` / `inFilterRange`, the `buildTreasuryOverview` rework (cash by payment mode, the unassigned-bank bucket), `quickCreateDuplicateGuard` identity rules, the `resolveApi` proxy, and warranty month end. None of these have unit tests, although all are pure functions and cheap to test.

## AGENTS.md compliance

| Rule | Result |
|---|---|
| App.jsx protection | Pass (not touched). |
| No business logic in screens | Pass. `SummaryScreen.jsx:12-15` and `EnvironmentManagerScreen.jsx:108` add capability guards only. `UnpostedDrilldown` (in `features/`, not a screen) now repeats a server rule (N8e). |
| Modular placement | Pass. The policy is a pure module, injected into the write layer: the right shape. The master-data site is the remaining exception (N4). |
| IPC, preload and route-key names | Pass. No renames. `SummaryScreen` now receives `api` as a prop (`screenRegistry.jsx:81`), which is a prop addition, not a route-key change. |
| Guided errors | Pass with one note (N6). The go-live history and xlsx messages are good. |
| Schema changes need approval | Pass. No schema change. The `highWater` field went into the JSON history, not the database. The F8 indexes, and a database-backed go-live table if one is wanted, would need approval. |
| Preserve core logic (§4) | Needs owner sign-off for the GRNI posting split and the bank-creation policy (N10). |
| Graph registry (Rule 25) | Fail (minor), carried over. |

## Recommended order

1. **N1 + N6**: declare system writes with `runAsSystem`, refuse writes with no actor, and give a bank-specific message. This is small and removes the fail-open risk.
2. **N3 + N2**: use the audit-log high-water mark, add one rollback planner in the service, and write the history file atomically with a `.bak`. Back up `runtime/deployment`.
3. **N4 + N5**: move the master-data bank check into the hook and write the audit row after the outcome. That closes F2 and most of F4.
4. **Test gaps**: cover the company omission case unconditionally, master-data "updated", bulk-import update, company delete, and unit tests for the pure renderer helpers. **N7**: add the preload-coverage test.
5. N8, N9, then the carried-over F6–F9 and F11. F8's indexes need approval.

None of these needs a schema change.
