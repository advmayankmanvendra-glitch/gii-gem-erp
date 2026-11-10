# Architecture and Sustainability Audit: commit 61dfe2b

Repo `/home/claude/gii-gem-erp`, HEAD `61dfe2b` ("Fix second Copilot review and the 182b11f in-house audit findings"). Scope: `git diff 182b11f 61dfe2b`, 15 files, +344/-67. Baseline: `audit-182b11f-architecture.md` (N1–N10). This was a read-only review. Nothing in the repo was edited, and the working tree was clean before and after. Scratch probes are in `/tmp/audit61-arch/probe/` (`tables.mjs`, `restart.mjs`, `p.mjs`). They run against the real `init.js`, the go-live services and the import parser, on throwaway databases. Written 2026-10-22.

Checks run:
- `npm run test:integrity` passed: **84/84 Node tests and 19/19 IPC tests**. At 182b11f it was 78 + 18.
- `npm run lint:syntax` passed (exit 0).
- I did **not** run the AGENTS.md §14 set (`build`, `verify:accounting`, `verify:financials`, and `verify:voucher-inventory`, which applies because inventory posting changed). Those scripts use the dev database, and this audit was read-only. The commit does not show that anyone ran them (see L6).

Claims marked *(inferred)* come from reading the code and were not run. Every other behaviour claim was run in a probe.

## Verdict

**Rating: Sustainable with conditions, and better than 182b11f. No High finding. Three Medium findings, each about a policy decision that is still implicit.**

What improved:
- The bank rule no longer blocks ordinary edits from forms that hide bank fields.
- The refusal now names bank details as the reason (N6 closed).
- The actor survives `await` inside `init.js`.
- The bank audit row on delete follows the actual outcome.
- The rollback guard now sees every table and audited edits, not just five tables.
- The history file is written atomically.
- The XLSX walker is linear.
- Each of these has a test.

AGENTS.md compliance:
- `App.jsx` was not touched.
- No IPC channel, preload method or route key was renamed or added.
- There is no schema change.
- The two renderer edits only change what is displayed.
- New messages are guided.

What remains:
1. **The rollback guard fails open in the case this commit newly allows.** A run whose history update was lost has no `highWater`, and the guard then returns without checking anything (M1).
2. **There are still two actor mechanisms, with different async behaviour.** Writes with no actor still skip the bank gate (M2).
3. **`updateRecord` is now a partial update for four tables and a full replace for the rest.** The set of four is copied by hand from the bank policy. The supplier alias map is now read in two ways, and a probe showed that one of them renames a supplier (M3).

## Findings

| # | Finding | Sev | Evidence (file:line) | Why it matters | Fix | Effort |
|---|---|---|---|---|---|---|
| M1 | The rollback data-loss guard is skipped in exactly the case this commit newly allows | **Med** | `goLiveService.js:214-216` now allows rollback of a run with no `resetResult` unless `resetFailed` is set or the status is `failed`. But `highWater` is written in the **same** `updateGoLiveEntry` call as `resetResult` (`:111-121`). When that update is lost, both are missing, and `assertGoLiveRollbackSafe` returns at once (`:185`, `if (!entry?.highWater) return;`). **Probe** (`p.mjs` P5): I recorded an `in_progress` entry with no mark, created a supplier, and ran the guard. It **did not refuse**, and `failGoLiveWithRollback` went on to the backup-restore step. The same path also covers a run that crashed *before* or *during* the reset: status `in_progress`, no `resetFailed`, books untouched. That run was refused at 182b11f and is now allowed with no guard *(inferred)*. The new test (`audit2-regressions.test.mjs:98-107`) asserts that this case is *not* refused, which locks in the fail-open path. The other parts of N3 also remain: the guard is still called only from the IPC handler (`main.js:1312`), it still throws while the service's other refusals return `{ rollbackResult: { success:false } }`, and there is no single planner. | Rollback restores the pre-go-live backup over the whole database. The one safety check against wiping real work depends on JSON evidence, and that evidence is missing in precisely the failure the change was written for. | Keep the evidence in the database, not only in the JSON. Inside the reset transaction, write the reset audit row with the `goLiveId` (the reset already returns `resetResult.auditId`). In `planGoLiveRollback(db, root, id)`, inside the service: (a) if there is no reset audit row for this `goLiveId`, the books were never reset, so refuse with "nothing to roll back"; (b) otherwise use that row's id as the audit mark when `highWater` is missing, and refuse if any later write row exists. Return one refusal shape and call it from `failGoLiveWithRollback`. Change the test so that "lost update **plus** later work" is refused and "lost update with no work" is allowed. | S |
| M2 | Two actor mechanisms with different async behaviour, and writes with no actor still pass the bank gate | **Med** | `init.js:1601-1615` now uses `AsyncLocalStorage`. That is the right tool, and the new test proves it survives `await`. But `main.js:234` still has `let currentActor`, set and restored around the handler (`main.js:300-307`). `actorId()` (`:239`) reads that variable at **33** call sites, including the master-data bank check (`:983`, `:987`), the go-live `userId` (`:1299-1311`) and audit attribution. That variable is cleared once the handler *returns a promise*, which is the bug N1 described. The no-actor rule is unchanged (`init.js:1753`, `if (changes.length && actor)`). **Probe** (P2): `updateRecord` with no actor changed a supplier account number with no permission check. There is no `runAsSystem`. **Probe** (P2b): `AsyncLocalStorage` passes the actor into a `setTimeout` scheduled inside the call, so the timer still sees the DEO actor after the call has ended. This is usually what you want, but it is not documented. | The ambient actor now follows two sets of rules. The first async `guarded` handler will see `actorId()` turn `null` after an `await`, while `currentActor()` in `init.js` keeps working. That leads to wrong attribution, or a refusal such as "No signed-in user" in the master-data path. The fail-open default remains: a background job or new channel that writes outside `runAsActor` skips the money-routing rule silently. | Delete the `main.js` global and define `actorId = () => currentActor()?.id ?? null`, using the `init.js` export. Add `runAsSystem(fn)`, which runs the store with `{ system: true }`. Have `guardBankDetailWrite` refuse when the actor is `null`, and skip only for `actor.system`. Wrap seeding, migrations, reset and go-live in `runAsSystem`. Add two tests: a write with no actor is refused, and seeding still passes. Add a comment that work scheduled inside a call keeps that call's actor. | S |
| M3 | Partial update for four tables only, a hand-copied table set, two meanings for one alias map, and alias knowledge in 3–4 places | **Med** | `crudHelpers.js:68` `KEEP_OMITTED_ON_UPDATE = {companies, suppliers, employees, banks}` is the key set of `BANK_FIELDS` (`bankDetailsPolicy.js:9-14`), typed again by hand. Every other table still blanks the columns you leave out. **Probe** (P1b): `updateRecord(db,"items",id,{remarks})` throws "item name is required". So `records:update` acts as a PATCH for 4 tables and a PUT for 60+. `SUPPLIER_FIELD_ALIASES` is a **fallback** in `normalizePayloadForTable` (`:106-108`) but a **replacement** in `withStoredFields` (`:76-79`). It is also not one-to-one: `supplier_account_name` is an alias of `supplier_name`. **Probe** (P1): `updateRecord(suppliers, id, { supplier_account_name: "Beneficiary Pvt Ltd" })` renamed the supplier from "Prime Industrial Suppliers" to "Beneficiary Pvt Ltd". In the same way, a generic `branch: ""` or `contact: ""` sent by some form would blank the stored canonical field *(inferred)*. The supplier aliases and the `bank_details` text format are also defined in `importValidationService.js:183-209` (twice) and `renderer/utils/importParsers.js:164-185`. `SUPPLIER_BANK_PARTS` (`crudHelpers.js:63`) is a third bank-field list, next to `BANK_FIELDS.suppliers` and `MASTER_IMPORT_BANK_KEYS`. | If someone adds a fifth bank-bearing table to the policy (customers or buyers with bank details, UPI masters) and does not update `crudHelpers`, partial forms on that table are refused as "wipes" again. That is the 182b11f regression coming back with no failing test. Mixed PATCH/PUT behaviour is a trap for every new screen. `crudHelpers` now holds supplier domain knowledge (546 → 590 lines). Changing save semantics also falls under AGENTS.md §4 ("Save/post/reversal behavior") and needs the owner's OK (L6). | (1) Export `BANK_TABLES` from `bankDetailsPolicy` and derive the keep-omitted set from it, or make the merge part of the injected hook's contract. Add a set-equality test. (2) Treat an alias as a replacement only when the canonical field is absent **and** the alias value is non-empty, and remove `supplier_account_name` from the `supplier_name` aliases for that step. Add P1 as a test. (3) Move `SUPPLIER_FIELD_ALIASES`, the bank parts and `composeSupplierBankText()` into `src/main/domain/supplierFields.js`, used by `crudHelpers` and `importValidationService`, with a parity test for the renderer fallback copy (the same pattern as `csvSafety`). (4) Longer term, decide on PATCH for `records:update` everywhere, after an owner decision. | S |
| L1 | The master-data bank check is still in `main.js` (N4 left open) | Low-Med | `main.js:980-988` still builds a preview, calls the bank permission, and writes a batch-level `bank_details_changed` row with no old or new values. The only change is that it now imports `enforceBankDetailPermission` from `init.js` (`main.js:14`), which adds one more cross-module export. It still uses the `main.js` `actorId()` (M2), and the preview is still built twice (F7). | This is the one remaining second enforcement site, with a second field vocabulary (`MASTER_IMPORT_BANK_KEYS`) and a second audit shape. The IPC layer is still making a policy decision. | As N4: pass `guardSensitiveWrite` into `confirmMasterDataUpdate` and call it for each row with the old row and the `dbField` values. Then delete `masterImportTouchesBankDetails` and `MASTER_IMPORT_BANK_KEYS`, and drop the import from `main.js`. | S |
| L2 | The guided bank message relies on matching the text of another module's error | Low | `init.js:1767-1772`: `enforceBankDetailPermission` rethrows only when `/^Permission denied/` matches **and** `/signed-in user/i` does not. Both strings live in `authService.js:84-86`. | If someone rewords `authService` (translation, style pass), the bank-specific message disappears silently, or the "no user" case gets the wrong text. The tests match on wording, so they would catch only part of this. | Have `enforcePermission` throw an `Error` with `code: "PERMISSION_DENIED"` and `reason: "role" \| "no_user"`, and branch on `code`/`reason`. Messages stay unchanged, and no IPC change is needed. | XS |
| L3 | High-water mark: the right direction (fail-closed), but a hand-kept deny-list and a loose rule for reading the audit log | Low | `goLiveService.js:167` `NOT_BOOK_TABLES` (6 names, and `sqlite_sequence` is redundant given `NOT LIKE 'sqlite_%'`). **Probe** (`tables.mjs`): 68 of 73 tables are marked. A restart after the reset did not trip the guard (`restart.mjs`), which is good. Gaps: (a) `users` is excluded from the audit branch (`:202`) but not from the `MAX(id)` branch, so adding a user blocks rollback while editing one does not. (b) Any audit row that names a table counts as a change, including refusals. For example, `bank_statement_direct_post_blocked` uses `table_name: "bank_statement_imports"` (`bankReconciliationService.js:551`), so a *blocked* action blocks rollback. (c) Service `UPDATE`s that write no audit row are not seen *(inferred; mostly harmless because reset clears the company's rows)*. (d) There is a `PRAGMA table_info` per table on each call, which is fine at this size. | Every new log or journal table must be added to a list in the go-live service, in a file the author of that table will never open. If they forget, rollback is refused for no reason. It fails safe, but it will produce support calls during go-live. | Classify tables once, where they are defined (for example `kind: "log"` in `schemaDefinitions`), and derive the exclusion from that. Count only write actions (`create`/`update`/`delete`/`hard_delete`/`deactivate`/`*_posted`/`*_created`), or exclude `*_blocked`/`*_denied`/`*_failed`. Treat `users` the same way in both branches. Add a test that a refused action does not block rollback. | XS-S |
| L4 | History writes are now atomic, but read side effects, recovery and backup are unchanged | Low | `goLiveHistoryService.js:78-90`: the file is written to a temp file, synced with `fsync`, copied to `.bak`, then renamed into place. The stricter `isValidHistory` (`:10-18`) is backward-compatible, because ids were always integers since `4c2dcf6`. Remaining: (a) `readHistory` still **renames** a file it considers invalid (`:54-60`), even when the reader is `go-live:history` on a readiness screen. (b) It does not fall back to `.bak` automatically, and the "missing" branch (`:30-37`) does not mention `.bak`. If the main file is missing and no `.corrupt-*` file exists, it starts empty and ignores a `.bak`. (c) A failed `renameSync` (Windows EPERM/EBUSY from antivirus or the indexer) leaves `*.tmp-<pid>` behind and shows an unguided error. (d) The directory is not synced with `fsync`. (e) `runtime/deployment/` is still not in the backup set (`backup.js` has no reference to it), so the advice "restore a good copy … from a backup" cannot be followed (Risk 16). | Most of N2 is fixed. What is left are the cases that turn a go-live day into a support call. | Move the "set aside" step into an explicit recovery action. On an invalid main file, validate `.bak` and offer it. Retry `rename` 3 times with a short back-off and give a guided message ("close programs scanning the Gii data folder…"). Remove stale `.tmp-*` files on the next write. Add `runtime/deployment/*.json` to backups. | S |
| L5 | XLSX walker: linear, but damaged markup still loses data silently. Three readers remain | Low | `importParserService.js:84-115` `forEachElement` is a single `indexOf` pass, so it is O(n × depth), and the 200k-unclosed-tags test runs well under 2 s. The tag-boundary check (`:91`) correctly skips `<col`/`<cols`. However, a missing close tag merges two elements. **Probe** (P6): with row 3 of 5 unclosed, the reader returned `S2,S4,S5,S6`, so **S3 was lost with no error**. With a cell missing `</c>`, cell B2 was lost. The old regex had the same behaviour, so this is not a regression, but the new walker is where it could be detected. The N9 items are unchanged: no bounds check on `localHeaderOffset` (`:173-175`), no ZIP64 support, and two renderer copies (`importParsers.js:62-130`, `fileParsers.js:226-266`) still use the old lazy regex with no caps. The new tests do not exercise the shared-strings path (`parseSharedStrings`, `:115-123`). | AGENTS.md §12 (Import Safety): a damaged file should be refused with guidance, not partly imported. The reader copies keep drifting. | In `forEachElement`, throw "The .xlsx file is damaged near row N. Open it in Excel, save it again, and retry" when `tagEnd === -1`, when `end === -1`, or when a nested `<tag` appears before `close`. Bounds-check `localHeaderOffset`. Delete `fileParsers.parseXlsxBufferBrowser`/`unzipXlsxBrowser`. Add a shared-strings test. | XS-S |
| L6 | Changes that need the owner's OK under AGENTS.md §4, and verification not shown | Low | New in this commit: (a) supplier returns under half a paisa post no voucher (`inventoryService.js:396-397`). This is posting behaviour, and no test covers it. (b) Update semantics for 4 masters (save behaviour, M3). (c) Rollback is now allowed for `in_progress` runs with no `resetResult` (M1). (d) The audit chain is now a hard go-live gate (`goLiveVerificationService.js:17-19`). Carried over from N10: the GRNI value split and bank gating on create for employees. §14 verification commands are not shown as run. | AGENTS.md §4 and §17 ("fix requires changing accounting or posting math"). | List (a)–(d) and the N10 items in the PR for the owner's "go". Add a test for the half-paisa return. Run and record §14 plus `verify:voucher-inventory`. | XS |
| I1 | The lint list is still hand-kept and misses the files changed here | Info | `lint:syntax` checks `main.js` but not `crudHelpers.js`, `goLiveService.js`, `goLiveHistoryService.js`, `importParserService.js` or `masterDataToolsService.js`. `node --check` does not follow imports. The tests do import these files, which is why nothing broke. | F11 carry-over. | Replace the list with a glob script (`node --check` over `src/main/**/*.js`). | XS |
| I2 | Inconsistent injection for `verifyAuditChain` | Info | `goLiveVerificationService.js:2` imports it straight from the 2,122-line `database/init.js`. `errorConsoleService` and `healthService` receive it as a parameter. There is no circular import today (I checked the `init.js` imports). | This adds another service that depends on the hub (Risk 6). | Pass it in from `goLiveService`, or move the audit-chain code into `database/auditChain.js`. | XS |
| I3 | A third variant of the CSV formula guard | Info | `masterDataToolsService.js:212-217` (doubles a leading `'`) and `:256` (strips one) are now different from `domain/csvSafety.js`. Bulk import (`importValidationService`) still does not strip (F5). The new round-trip test is good. | The encode and decode rules are in different files. | Put an `encodeCsvCell`/`decodeCsvCell` pair in `csvSafety` and use it in both the master-data and bulk-import paths. | XS |
| I4 | Small items | Info | (a) `errorConsoleService.js:172` adds `!chain.missingNewestRows`, but `verifyAuditChain` already pushes that gap into `broken` (`init.js:1701`). It is redundant and harmless. (b) The renderer edits only change what is displayed: `ReadOnlyReportFamilyScreen.jsx:430` hides Ledger on summary rows, and `HelpAssistantRecentErrors.jsx:12-14` resets state. Both pass §7. (c) `validate-cor1.mjs` now exits non-zero on errors, which is good. (d) The bank refusal lists every kind of bank field, not the field that changed. `bankDetailChanges` already knows the field names, so the message could name them (§13). | — | For (d), add `changes.map(c => c.field)` to the message. | XS |

## Previous findings (audit at 182b11f): status at 61dfe2b

| # | Finding | Status |
|---|---|---|
| N1 | The bank gate turns itself off with no ambient actor; the actor is lost after `await` | **Partly fixed.** `AsyncLocalStorage` keeps the actor across `await` in `init.js`, and this is tested (`audit2-regressions.test.mjs:121-128`). Still open: the fail-open on `null` (no `runAsSystem`, probe P2), and the `main.js` `currentActor` global, which still loses the actor after `await` (M2). |
| N2 | History read fail-closed but written non-atomically | **Mostly fixed.** The write is atomic with `fsync` and keeps a `.bak`; reused or invalid ids are rejected; both are tested. Still open: the rename-on-read side effect, no automatic `.bak` fallback, unguided rename failure, and the backup set (L4). |
| N3 | High-water covers 5 tables; check sits in the IPC layer; two refusal shapes | **Partly fixed.** It now covers every table with an `id` plus audited edits, tested for create and for edit. It also reads legacy marks. Still open: the guard is called only from the handler, it throws where the other refusals return, there is no planner, the guard fails open when the mark is missing (M1), and the deny-list is hand-kept (L3). |
| N4 | Master-data bank check in `main.js` | **Left.** Only the message changed (L1). |
| N5 | Sensitive audit written before the delete outcome; bank wording fixed in a generic hook | **Mostly fixed.** The audit row is written only after a soft or hard delete succeeds, and deactivation writes none (`crudHelpers.js:475-490`). Still open: no `db.transaction` around `deleteRecord`; `auditSensitiveWrite` still hard-codes `bank_details_changed`/`security` (`:369-379`); seeding still writes bank rows with no user. |
| N6 | Refusal does not say that bank details are the reason | **Fixed.** There is a guided message, and it is tested (`ipc-security.test.mjs:293-294`). It relies on matching message text (L2). |
| N7 | `desktopOnlyActions` third preload list | **Left** (out of this diff). |
| N8 | Drilldown date filtering in two layers | **Left** (out of this diff). |
| N9 | Lazy xlsx reader edge cases; three readers | **Left.** The new linear walker is an improvement of its own, but (a)–(c) are unchanged (L5). |
| N10 | Core-logic sign-offs | **Still pending**, with four new items (L6). |

The carried-over F6–F9 and F11 items are unchanged. **Risk 6** (the `init.js` hub) grew from 2,112 to 2,122 lines, and `crudHelpers.js` from 546 to 590. **Risk 16** (runtime JSON not backed up) still stands and matters for L4.

## Test coverage of the new paths

Covered:
- Partial edit forms for employees and suppliers with bank fields held back.
- A supplier imported through master data stays editable.
- DEO `imports:confirm` update.
- Company omission now runs unconditionally, which closes the 182b11f gap.
- Company bank wipe refused, with the reason.
- Rollback mark for create and for edit.
- Legacy five-table mark.
- Lost update allowed (but see M1).
- History `.bak`, no stray temp file, reused ids rejected.
- Actor survives `await`.
- Linear walker on unclosed tags.
- Self-closing cells.
- Master-data apostrophe round-trip.

Not covered:
- Lost update **with work entered after go-live**, which must be refused (M1).
- A write with no actor (M2).
- `actorId()` after an `await` in a `guarded` handler (M2).
- That `KEEP_OMITTED_ON_UPDATE` equals the policy table set (M3).
- A partial supplier update sending only `supplier_account_name` (M3, probe P1).
- Master-data "updated" rows that change bank details (carried over).
- A refused action not blocking rollback; a new log table (L3).
- `.bak` recovery; rename failure (L4).
- Damaged XML markup; shared strings (L5).
- Half-paisa supplier return (L6a).
- Audit chain as a go-live gate (L6d).
- Renderer: the Ledger-button guard and the Help Assistant reset.

## AGENTS.md compliance

| Rule | Result |
|---|---|
| §2 App.jsx protection | Pass (not touched). |
| §7 No business logic in screens | Pass. The two renderer edits only change what is displayed. |
| §3/§6 Modular placement, no silent refactors | Pass with notes. Supplier domain knowledge has grown inside `crudHelpers` (M3), and `main.js` still holds one policy site (L1). |
| §4 IPC, preload and route-key names | Pass. No renames. `enforceBankDetailPermission` is a new main-process export, not an IPC or preload change. |
| §4 Preserve core logic (posting, save behaviour) | **Needs owner sign-off** (L6): the half-paisa voucher skip, partial-update semantics, rollback eligibility, the audit-chain gate, and the N10 carry-overs. |
| §12 Import safety | Partial. The walker is linear, but damaged markup is still imported partly with no error (L5). |
| §13 Guided errors | Pass. The bank refusal is now guided. Two gaps: a history rename failure (L4) and damaged XLSX markup (L5). |
| §14 Verification commands | Not shown as run (L6). |
| Schema changes need approval | Pass. No schema change. M1's fix needs none either, because it uses audit rows. |

## Recommended order

1. **M1**: keep the reset evidence in the database and add one rollback planner in the service. Fix the test that locks in the fail-open path. This is small, and it closes the only data-loss path found.
2. **M2**: one actor source (`actorId` reads from `AsyncLocalStorage`), add `runAsSystem`, and refuse writes with no actor.
3. **M3**: derive the keep-omitted set from the policy, make the alias replacement one-to-one, and extract `supplierFields.js`. Get the owner's decision on PATCH semantics.
4. **L1, L2**: move the master-data check into the hook, and match on a typed permission error.
5. **L3–L5**: classify log tables, then the history recovery and backup items, then guided errors for damaged XLSX files.
6. **L6**: owner sign-off list and the §14 run. Then the Info items.

None of these needs a schema change or an IPC, preload or route-key change.
