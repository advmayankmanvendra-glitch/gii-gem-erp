# Architecture and Sustainability Audit: commit a97daf4

Repo `/home/claude/gii-gem-erp`, branch `claude/erp-full-automation-qbhv8k` (PR #4), HEAD `a97daf4` ("Close the a55b2d0 audit findings"). Scope: `git diff a55b2d0 a97daf4`, 9 files, +235/-79. This includes the intermediate commit `f4b5e8d` ("Stock drilldown: drop the unused accounting request"), which only touches `StockDrilldown.jsx`. Baseline: `audit-a55b2d0-architecture.md` (N5–N11, M1–M3, L1–L7, I1–I4). This was a read-only review. Nothing in the repo was edited, and `git status --porcelain` was empty before and after. Written 2026-11-10.

Scratch probes are in `/tmp/auditA97-arch/`. Each one runs against the real `init.js` and services on throwaway databases, and each one was also run against an exported copy of a55b2d0 (`/tmp/auditA97-arch/old/`) to tell new behaviour from old.
- `p.mjs`:
  - Q1: `null` on the keep-omitted masters.
  - Q2: `storableValue` (booleans, `Date`).
  - Q3: invisible-only column and alias values, and the account-name alias.
  - Q4: the CRAC writer passed as `null` or left out.
  - Q5: the TSV line pre-count, and the CSV row number.
- `x.mjs`: an XLSX of 180,001 rows × 6 columns (1,080,006 cells, 3.0 MB) next to the same data as CSV.
- `v.mjs`: voucher-proposal reject, approve and update when the `audit_log` insert fails, and the resulting action string.

Checks run:
- `npm run test:integrity` passed: **98/98 Node tests and 19/19 IPC tests**. At a55b2d0 it was 93 + 19.
- `npm run lint:syntax` passed (exit 0).
- I did **not** run the AGENTS.md §14 set (`build`, `verify:accounting`, `verify:financials`, `verify:controls`, `verify:voucher-inventory`). Those scripts use the dev database. The commit message (`git log -1 a97daf4`) records neither a §14 run nor a §4 approval (L6).

Claims marked *(inferred)* come from reading the code and were not run. Every other behaviour claim was run in a probe or in the suite.

## Verdict

**Rating: Sustainable with conditions. Roughly level with a55b2d0. No High finding.**

The commit closes the two items the last audit ranked first, N6's atomicity and N5. It also turns three more findings (N7, N8, N9) from silent into loud. To get there it adds behaviour that sits in shared, every-table code paths, which costs about as much sustainability as it buys:
- `storableValue` now runs in `cleanPayload` for **every table**. It turns `true`/`false` into numbers, and SQLite stores those as `"1.0"`/`"0.0"` in text columns (N12).
- The XLSX cell cap was **halved** to 1,000,000, so an XLSX now hits a different limit from the same data sent as CSV (N13).
- A key sent as `null` now means "keep" on four masters and "clear" on every other table (N15).
- The Tally preview gained a 25 MB **total** budget that a single large export cannot pass (N16).
- The import limits grew from 13 to 16 constants, and 8 messages hard-code their numbers (N17).

**M2 (Medium) is unchanged and is not made worse.** The one new actor use, the rollback refusal row (`main.js:1320`), reuses the `userId` already taken from `actorId()` at `main.js:1312`. The redundant override at `main.js:879` is still there. SEC-1 is still the place to close M2.

What improved:
- **N6: voucher-proposal atomicity is closed.** Update, approve and reject now run in `db.transaction` (`bankReconciliationService.js:642-679`, `:686-691`, `:698-702`). Probe `v.mjs`, with `audit_log` failing:
  - At a97daf4, reject, approve and update each threw. The proposal stayed `Suggested`, with 0 `voucher_proposal_audit` rows.
  - At a55b2d0, reject saved `Rejected` and update saved `Needs Review` / `narration: 'n'`, even though each threw.
  - A test covers the failure path through a `voucher_proposal_audit` trigger (`audit2-regressions.test.mjs:554-561`).
- **N5: the invisible-only alias no longer erases a bank part.** `hasValue` strips U+200B–U+200D and U+FEFF (`crudHelpers.js:53`). The bank-text rebuild now asks the same question as `cleanPayload`, through `supplierBankPartsChanged` (`crudHelpers.js:94`, `:101-105`).
  - Q3b: `{branch:"​"}` keeps `supplier_branch="Pune"` and logs nothing. At a55b2d0 the probe gave `""` and 1 `bank_details_changed` row.
  - The test covers six payloads (`audit2-regressions.test.mjs:512-526`).
- **N7 is loud now.** Leaving out the writer refuses with a guided message (`cracService.js:10-12`, `orderClosureService.js:37`). Q4b: refused, and 0 CRAC rows were added. At a55b2d0, 1 row was added with no audit.
- **N8 in part.** Only messages that start `"Rollback refused:"` become answers. Every other error is rethrown, so it is journaled again (`main.js:1319`), and the refusal leaves a `go_live_rollback_refused` audit row (`main.js:1320`).
- **N9 in part.** The refusal names the Excel row (`importParserService.js:361`, `:376`). The search for the header is limited to the first 50 filled rows again (`:367`), so `MAX_HEADER_SEARCH_ROWS` once more means what it says. A row far down counts as a header only when it looks like one (`:373-374`).
- **Import parser hardening.**
  - Per-cell caps while CSV is read (`:83-85`, `:101-104`).
  - Per-value and total caps on shared strings, applied before decoding (`:207-228`).
  - The key-size refusal now names the header titles (`:53-55`), which closes that part of the N3 message gap.
  - The a55b2d0 "TSV blank lines" test was hollow: `t.csv` went to `parseCsv`, not `parseDelimited` (`:398`). It now uses `.xls` and reaches `parseDelimited` (`audit2-regressions.test.mjs:460`).
- **`StockDrilldown.jsx`** drops an accounting request whose result was never read (`StockDrilldown.jsx:16-18`). Nothing in the file reads `accounting` any more.

AGENTS.md compliance:
- `App.jsx` was not touched.
- No IPC channel, preload method, route key or schema was changed.
- The new refusals are guided (§13), with three exceptions:
  - the TSV line message is wrong for a file that is mostly filled (N14);
  - the Tally message cannot be followed for a single file (N16);
  - the CSV row number counts filled rows (N9).
- §6: the `updateVoucherProposal` re-indent is part of the fix and is visible in the diff.
- **§4 is the gap.** Every new behaviour in this commit is a "save behaviour" or "existing workflow" change in the §4 sense, and none is recorded as approved. Items (w)–(cc) are listed below.

## Design choices asked about

| Choice | Judgement |
|---|---|
| **`storableValue` in `cleanPayload` for every table** (`crudHelpers.js:143-149, 159`) | **The right layer to stop raw SQLite errors, but the value it stores is wrong for text columns, and its reach is wider than its purpose.** (a) **`"0.0"` / `"1.0"`.** better-sqlite3 binds JS numbers as REAL, so a 1/0 in a TEXT-affinity column is stored as `"1.0"`/`"0.0"`. That is exactly the defect `normalizeBankValue` was written to avoid (`bankDetailsPolicy.js:44-45`). Q2: `{remarks:false}` on a supplier stored `remarks="0.0"` (`typeof` text). `{supplier_name:true}` stored a supplier named `"1.0"`, which passed the required-field check (`crudHelpers.js:164-168`). At a55b2d0 all four Q2 cases were refused with the raw "SQLite3 can only bind…" message. Only integer columns get a clean value: Q2c gave `items.inventory_enabled=1`. (b) **Its test does not test its title.** The test "yes/no values are stored as 1/0" only asserts `doesNotThrow` (`audit2-regressions.test.mjs:528-533`). (c) **Every table.** This includes transaction tables reached through generic `createRecord` and `updateRecord` (`crudHelpers.js:415, 468`), so a stray boolean in an amount or status field is now stored as 1 or 0 instead of refused *(inferred)*. (d) **Two boolean rules.** Bank fields refuse booleans (`bankDetailsPolicy.js:47-53`; Q2e), and every other field converts them. (e) `Date` and `Buffer` are now refused as "a list or object" (Q2d). The message is guided but names the wrong cause for a date. (f) It does not fix whole numbers sent to text columns, which keep the old `".0"` behaviour outside the bank fields *(inferred from the same binding rule)*. **Fix:** convert booleans only for columns whose declared type is INTEGER (use `PRAGMA table_info`, cached once per table). Refuse a boolean for a TEXT column with a guided message, or bind `1n`/`0n` (BigInt binds as INTEGER, so it would be stored as `"1"`). Give `Date` its own message (`toISOString().slice(0,10)` for `*_date`). Assert the stored value in the test. |
| **`hasValue` treats invisible characters as blank** (`crudHelpers.js:53`) | **Correct, and it closes N5's alias route. The set of characters is now a second copy.** The class `[\s​-‍﻿]` is retyped from `EDGE_SPACE` (`bankDetailsPolicy.js:27`). If one is widened (U+2060 word joiner, U+00AD soft hyphen), the "present" and "same" rules drift apart again. That is the drift N5 was about. Side effects, all reasonable but not recorded: (a) an invisible-only `supplier_name` now falls back to its aliases (Q3d: `"RealCo"`; at a55b2d0 `"​"`), and with no alias it is refused as required *(inferred, `crudHelpers.js:120, 164-168`)*; (b) an invisible-only `bank_details` is rebuilt from the parts (`:124`). (c) **Residue: the column route.** `{supplier_branch:"​"}` still clears the branch and logs `bank_details_changed` (Q3; same at a55b2d0). This follows the stated rule that "blank text is an explicit clear" (`:81`), but an import cell holding only a ZWSP is not a deliberate clear. It is gated and audited, so it is Info (N18). **Fix:** export one `isBlank`/`text()` from `bankDetailsPolicy` (or a tiny `domain/text.js`) and use it in both files. |
| **`withStoredFields` drops `undefined` and `null` keys** (`crudHelpers.js:80-83`) | **It closes the "null column wipes the bank text" route, but it gives `null` two meanings.** On `companies`, `suppliers`, `employees` and `banks` (`KEEP_OMITTED_ON_UPDATE`, `:76`), `null` now means "keep the stored value". On every other table `cleanPayload` still turns it into `""` (`:159`), which means "clear". Q1 gave `employees.remarks:null`, which kept `"keep me"` (at a55b2d0 it cleared to `""`). Q1d gave `warehouses.remarks:null`, which cleared (unchanged). Any form or script that clears a field on those four masters by sending `null` now silently keeps the old value *(inferred; I found no renderer caller doing that, but the IPC `records:update` at `main.js:1093` accepts any payload)*. `importValidationService.js:412` spreads the stored row, so its `NULL` columns are now dropped and re-added, which gives the same outcome. The table list that decides this is the hand-typed `KEEP_OMITTED_ON_UPDATE` from M3. **Fix:** document `null` = "keep" as a rule of the generic update, applied to every table, or limit the drop to `undefined` plus the bank parts. Add a test that `null` behaves the same on a keep-omitted master and on an ordinary one. |
| **Voucher-proposal transactions** (`bankReconciliationService.js:639-704`) | **N6 atomicity is closed (probe `v.mjs`).** Three things remain. (a) The proposal is read outside the transaction (`:641`, `:685`, `:697`) and its status is checked inside against that copy. With one synchronous connection this cannot interleave, so it is cosmetic. Reading inside the transaction would make the code say what it does. (b) **The action vocabulary is still built from strings.** `` `voucher proposal ${…toLowerCase().replace(/^proposal /, "")}` `` (`:403`) now gives "voucher proposal approved", but also "voucher proposal draft voucher created" and "voucher proposal voucher posted". That vocabulary uses spaces, while the neighbours in the same file use snake_case (`voucher_proposals_generated` `:591`, `voucher_proposal_posted` `:779`). The regex silently depends on the display labels at `:587, 678, 690, 701, 732, 778`. (c) **Volume.** Posting still writes three rows for one event (`:778` mirrored, `:779`). Generate writes one mirror row per bank line plus a summary (`:587, 591`). **Fix:** a frozen `{ "Proposal Approved": "voucher_proposal_approved", … }` map, with the separate `:779` row dropped. |
| **CRAC and closure writers are required** (`cracService.js:10-12, 78, 104, 135`; `orderClosureService.js:37`) | **Loud instead of silent: good. It is still an optional parameter with a throwing default, not a dependency.** (a) An explicit `null` bypasses the default and gives the raw `"audit is not a function"` (Q4; it rolls back, but the message is not guided). (b) The refusal text is written twice in two styles, a named function and an inline arrow in the signature (`orderClosureService.js:37`). (c) It is still the third writer signature, and `new_value` is still `{record, supply_order_id}` (`cracService.js:24`). (d) There is still no IPC-level test that `crac:create` leaves a row. The test calls the service directly (`audit2-regressions.test.mjs:563`). **Fix:** `createCracService({ auditLog })`, with `typeof auditLog === "function"` checked once at construction. |
| **Rollback refusal audit row and rethrow** (`main.js:1311-1326`) | **The narrowing fixes N8's "every error becomes a refusal". The classification is now a string-prefix contract shared by three services.** (a) `"Rollback refused:"` is produced by `goLiveService.js:238, 257, 264-277`, `rollbackService.js:44, 48, 52` and `operationalResetService.js:356, 359`. Only the first set reaches this `catch`, but nothing stops a nested call from passing on one of the others, and a rewording silently turns a refusal into a thrown fault. This is L2's pattern again. (b) **Two audit vocabularies for one event.** A refusal from the guard writes `go_live_rollback_refused` (`main.js:1320`). A refusal from the second layer (`failGoLiveWithRollback` → `rollbackRefusalReason` `goLiveService.js:283-284`, or `executeAutoRollback`'s missing-backup and pending-restore answers `rollbackService.js:48, 52`) writes `go_live_rollback` with `success:false` (`main.js:1324`). The second layer also marks the history entry `rollback_failed` (`goLiveService.js:288`) *(inferred)*. (c) The new row does not block a later rollback only because `table_name: "system"` is not a book table (`goLiveService.js:248, 254`). That is correct but implicit. A comment, or adding the action to `READ_ONLY_AUDIT_ACTIONS` (`:176`), would make it explicit. (d) No `company_id`, and no test of either the audit row or the rethrow. (e) The unused `db` and `userId` parameters remain (`goLiveService.js:282`, called with `null` at `main.js:1322`). **Fix:** as before, a typed `error.code = "ROLLBACK_REFUSED"` and a `goLiveService.rollbackGoLive(...)` that owns the mapping, the audit row and the action name for both layers. |
| **Import limits** (`importParserService.js:22-33, 239-246`; `tallyImportService.js:425-426`) | **Each cap is defensible, but the set is now harder to reason about than the risks it covers.** (a) **XLSX and CSV diverge.** `MAX_XLSX_CELLS` went from 2,000,000 to 1,000,000 (`:243`), while `MAX_IMPORT_ROWS` stays at 200,000 and `MAX_IMPORT_VALUES` at 6,000,000 (`:23-24`). Probe `x.mjs`: 180,000 rows × 6 columns is refused as XLSX ("more than 1,000,000 cells") and imports as CSV (180,000 rows). At a55b2d0 both imported. For XLSX the row and value caps can no longer be reached past about 1M cells, and the shared-string count is now tied to the same cap (`:211`) (N13). (b) **16 constants** in two blocks of one file (15 named plus the derived `HEADER_TITLE_MAX_CHARS`), up from 13. There are also unnamed factors: `* 6` (`:219`), `* 10` (`:356`) and `* 2` (`:26`). Two more constants sit in the Tally service, and `MAX_TALLY_PREVIEW_BYTES` repeats `MAX_IMPORT_BYTES`, linked only by a comment (`tallyImportService.js:445`). (c) **Hard-coded numbers in messages:** "32,767" (`:84, 103, 203, 347`), "1,000,000" (`:212, 339`), "16 million" (`:224`), "67 million" (`:351`) and "25 MB" (`:250`). Formats are still mixed: `en-IN` gives "4,00,000" (`:120`) and "2,00,000" (`:36`), next to the western "1,000,000". (d) **`MAX_KEY_CHARS` now also budgets values** (`:57-65`), so its name no longer says what it limits, and the `keyChars` clause at `:66` can only trigger when rows exceed `MAX_IMPORT_ROWS`. (e) `MAX_CELL_CHARS` is used at `:83` before its declaration at `:245`. That is safe at run time, but a reader must know the factory scope. **Fix:** N3's frozen `IMPORT_LIMITS` object, with the messages formatted from it in one locale. Restore the XLSX cell cap to `MAX_IMPORT_VALUES`, or derive one from the other, and add a test that the same 180k × 6 sheet imports in both formats. |
| **TSV line pre-count** (`importParserService.js:113-122`) | **It stops a file of blank lines from holding the main thread (the test runs in under 1.5 s), but it counts every line, not the blank ones.** Q5: a TSV of 450,000 **filled** lines is refused with "…more than 4,00,000 lines, **most of them blank**. Delete the blank lines…". That is not true, and the instruction cannot help, since the a55b2d0 build gave the correct row-limit message. Q5b: 150,000 filled rows plus 260,000 blank lines (accepted at a55b2d0, 150,000 rows) is now refused (N14). **Fix:** count only lines that hold something other than whitespace and the delimiter, or fall through to `tooManyRows()` when the filled count is what crossed the limit. |
| **Late header heuristic** (`importParserService.js:366-380`) | **Better than a whole-sheet refusal, but it fixes the case of a single-column sheet as "read from row 1".** (a) A late header needs at least two filled cells (`:374`). A sheet of 60 title rows and a one-column `item_name` header at row 61 therefore imports **60 records keyed by the first title row**, and the new test asserts exactly that (`audit2-regressions.test.mjs:467`). That is the silent mis-map N4 and N9 asked to refuse. (b) When no header is found, the parser still falls back to row 0 (`:378-380`). (c) The message mixes units: "Excel row 61 … within the first 50 **filled** rows" (`:376`). (d) The CSV cell refusal reports `rows.length + 1`, which counts filled rows. Q5c: "row 3" for a cell on file line 6. **Fix:** let each import type pass its `headerTitles`, refuse when none is found, and keep the line number while reading CSV. |
| **Tally preview 25 MB budget** (`tallyImportService.js:426, 444-451`) | **A total cap is reasonable for the main thread. A single file above it cannot be previewed at all.** The message says "Preview them in smaller batches", which cannot be done for one file. Tally XML exports are often UTF-16, which doubles their size on disk (`readXmlText` `:117-129`). A large company's masters file over 25 MB is therefore plausible *(inferred)*. `previewTallyStockXml` (`:417`) reads one file with no cap at all. A `statSync` error counts as 0 bytes (`:447`), so the cap is skipped for a file that cannot be read, and that file then fails later with its own message. **Fix:** a per-file cap with its own message ("this export is N MB; export the masters in parts from Tally: Gateway › Export › …"), the total cap on top of it, and the same cap on the stock preview. |

## Findings

| # | Finding | Sev | Evidence (file:line) | Why it matters | Fix | Effort |
|---|---|---|---|---|---|---|
| N12 | `storableValue` stores booleans as `"1.0"`/`"0.0"` in text columns on every table; a required text field accepts `true` | **Low-Med** (new) | `crudHelpers.js:143-149, 159`. Q2: `remarks:false` gave `"0.0"`; `supplier_name:true` gave `"1.0"`, which passed `:164-168`. At a55b2d0, a raw refusal. Bank fields refuse booleans instead (`bankDetailsPolicy.js:47-53`). The test only checks no-throw (`audit2-regressions.test.mjs:528-533`). | A form or script bug that used to fail loudly now writes plausible-looking junk into masters and (through generic CRUD) transaction rows. It is the `".0"` class N10 is still cleaning up for bank fields. | Convert per declared column type, refuse booleans for TEXT, give dates their own message, and assert stored values. | XS-S |
| N13 | XLSX cell cap halved to 1M; XLSX and CSV of the same data now diverge; the row and value caps cannot be reached for XLSX | **Low-Med** (new) | `importParserService.js:243, 211, 338-339` against `:23-24`. `x.mjs`: 180,001 × 6 XLSX refused, the same CSV imports 180,000 rows. Both imported at a55b2d0. | §4 "existing workflows": a bank statement or master export that imported last week as XLSX is now refused, and the user is told to split it although the same data as CSV is fine. | Derive the cell cap from `MAX_IMPORT_VALUES` (or the reverse) inside one `IMPORT_LIMITS`, and test both formats with the same sheet. | XS |
| N16 | Tally preview: a single file over 25 MB can never be previewed; message not actionable; the stock preview has no cap; stat errors skip the cap | **Low-Med** (new, inferred size risk) | `tallyImportService.js:426, 444-451`. UTF-16 handling at `:117-129`. Uncapped `previewTallyStockXml` at `:417`. | The master-migration preview is the onboarding path. A large or UTF-16 export is blocked with advice it cannot follow (§13). | Per-file cap with its own guided message, the total cap on top, and the same cap for the stock preview. | XS |
| N6 | Voucher-proposal audit: atomicity **closed**; action names still derived by string munging; triple rows on post | Low (was Low-Med) | `bankReconciliationService.js:403` (regex). Labels at `:587, 678, 690, 701, 732, 778`. `:778-779` (triple rows). | The audit vocabulary drifts ("voucher proposal draft voucher created"), and post-time volume is tripled. | Fixed action map to snake_case, and drop `:779`. | XS |
| N7 | CRAC and closure writer: refusal is loud, but the parameter is still optional; explicit `null` gives a raw error; refusal text duplicated; odd `new_value`; no IPC test | Low (narrowed) | `cracService.js:10-12, 24, 78`. `orderClosureService.js:37`. Q4: `null` gave "audit is not a function". | A future caller gets a raw error. An audit report needs a special case for the CRAC shape. | `createCracService({ auditLog })`, the record itself in `new_value`, and an IPC test. | XS |
| N8 | Rollback refusal classified by message prefix in `main.js`; two audit actions for refusals; refusal row ignored by the guard only implicitly; untested; unused parameters | Low (half closed) | `main.js:1319-1324`. Prefix producers: `goLiveService.js:238, 257, 264-277`, `rollbackService.js:44-52`, `operationalResetService.js:356-359`. Guard filter: `goLiveService.js:248, 254`. Unused parameters: `:282`, `main.js:1322`. | A reworded message flips a refusal into a fault (or the reverse), and audit reports must know two names for one event. | Typed `ROLLBACK_REFUSED`, with one `rollbackGoLive` in the service for both layers, and tests for the audit row and the rethrow. | XS-S |
| N9 | Header search: one-column late header silently read from row 1 (and now locked by a test); no-header fallback; mixed row units; CSV row number counts filled rows | Low (partly closed) | `importParserService.js:373-380, 376`. CSV: `:84, :103`. Test at `audit2-regressions.test.mjs:467`. Q5c: "row 3" for line 6. | §12 "block unsafe import" and §13 "where it failed". | Per-import `headerTitles`, a refusal when none is found, and line numbers kept while reading. | S |
| N10 | Bank key ownership split; account-name alias not normalised; legacy `".0"` values | Low (unchanged) | Q3c: `supplier_account_name=" Acme Pvt ​"`, padded inside `bank_details`. `bankDetailsPolicy.js:11-23` against `crudHelpers.js:56-71, 139`. | As before. | As before. | S |
| N14 | TSV line pre-count counts filled lines too: wrong "most of them blank" message; files accepted at a55b2d0 now refused | Low (new) | `importParserService.js:116-122`. Q5: 450k filled lines gave "most of them blank". Q5b: 150k filled + 260k blank refused (accepted at a55b2d0). | §13: wrong cause and wrong instruction. §4: a regression in an existing workflow. | Count only non-blank lines, or fall through to `tooManyRows()`. | XS |
| N15 | `null` means "keep" on four masters and "clear" on all other tables | Low (new) | `crudHelpers.js:80-83` against `:159`. Set at `:76`. Q1: employees `remarks:null` kept (cleared at a55b2d0). Q1d: warehouses cleared. | A hidden rule that each future form author must know per table. A clear sent as `null` silently fails on those masters. | Make it a rule for every table, or restrict it to `undefined` plus the bank parts, and test both kinds of table. | XS |
| N17 | Import limit sprawl grows: 16 constants plus 3 bare factors, numbers hard-coded in 8 messages, two number formats, `MAX_KEY_CHARS` misnamed, dead clause | Low (N3 residue, grew) | `importParserService.js:22-33, 239-246`. Factors at `:26, 219, 356`. Messages at `:84, 103, 203, 212, 224, 250, 339, 351`. `:57-66`. `tallyImportService.js:426, 445`. | Each future change to a limit is a multi-site edit with message drift. The XLSX/CSV divergence (N13) is a symptom of it. | Frozen `IMPORT_LIMITS` feeding the messages, one locale, and tests per cap. | S |
| N18 | Second copy of the invisible-character class; `supplierBankPartsChanged` evaluated twice per supplier update; invisible-only column value still clears the bank part | Info (new and residue) | `crudHelpers.js:53` against `bankDetailsPolicy.js:27`. `crudHelpers.js:94` and `:468`. Q3: `{supplier_branch:"​"}` gave `""` plus 1 `bank_details_changed` (same at a55b2d0). | The "present" and "same" rules can drift again. The two calls must agree. | One shared `isBlank`/`text()`. Compute once in `updateRecord` and pass it in. | XS |
| N19 | Test labels say "219b2d3+1 round" for a55b2d0 fixes | Info (new) | `audit2-regressions.test.mjs:512, 528, 535, 554, 566`. | Traceability from audit to test. | Relabel "a55b2d0 round". | XS |
| N11 | Tally duplicates removed by `path.resolve` (case-sensitive on Windows); shape-agnostic test | Info (unchanged) | `tallyImportService.js:434`. | As before. | As before. | XS |
| M1 | Rollback guard residual coupling | Low (unchanged) | Unused parameters at `goLiveService.js:282`, `main.js:1322`. The lost-mark test still writes the reset row by hand. | As before. | As before (see N8). | XS |
| M2 | Actor sources: `currentActor`/`actorId()`, `withActor`, ambient `actorStore`; writes with no actor skip the bank gate | **Med** (unchanged, **not worse**) | `main.js:234, 239, 257-265`. `init.js:1755-1756` (`if (changes.length && actor)`). Redundant `main.js:879` still present. `imports:parse-file`/`parse-buffer` still unguarded (`main.js:922, 929`). The new row at `main.js:1320` reuses `userId` from `:1312`, so no new source was added. | Unchanged. Planned to close in SEC-1. | As before. Remove `:879` in SEC-1. | S |
| M3 | Supplier aliases residue; hand-typed `KEEP_OMITTED_ON_UPDATE` | Low (slightly grew) | `crudHelpers.js:76` now also decides what `null` means (N15). | As before. | As before. | XS-S |
| L1 | Master-data bank check in `main.js` | Low-Med (unchanged) | `main.js:984-988`. | As before. | As before. | S |
| L2 | Refusals matched by message text | Low (grew) | `init.js:1773`, plus the new prefix contract at `main.js:1319` (N8). | As before. | Typed `code`. | XS |
| L3–L5, L7 | Rollback deny-list, history and backup gaps, parser copies, dev runtime root | Low (unchanged) | `goLiveService.js:176`; `main.js:197`. | As before. | As before. | — |
| L6 | §4 owner sign-offs and §14 runs not shown | Low | Carried over: (a)–(v). New: (w)–(cc), listed below. `git log -1 a97daf4` records neither. | AGENTS.md §4, §14, §17. | List (a)–(cc) in the PR for the owner's "go", and record §14 plus `verify:controls` and `verify:voucher-inventory`. | XS |
| I1 | Lint list typed by hand | Info (unchanged) | `package.json:25`. 26 of 52 tracked `src/main` JS files are unchecked. Every file changed here is listed. | As before. | Glob. | XS |
| I2–I4 | Small items | Info | Unchanged. | — | — | — |

## Previous findings (audit at a55b2d0): status at a97daf4

| # | Status |
|---|---|
| N5 | **Closed** for the alias route (Q3b, test `:512-526`). The column route (an invisible-only value under the column name clears the part) follows the "blank clears" rule and is now Info inside N18. |
| N6 | **Atomicity closed** (`v.mjs`, test `:554-561`). Naming and volume remain, at **Low**. |
| N7 | **Narrowed.** The silent no-op is gone. The optional parameter, explicit `null`, `new_value` shape and IPC test remain. |
| N8 | **Half closed.** Faults are rethrown and journaled, and refusals are audited. The prefix contract, the two refusal actions, the unused parameters and the missing tests remain. |
| N9 | **Partly closed.** Excel row, a 50-row search, and a heuristic for a header far down. The one-column case is now asserted as "read from row 1". The no-header fallback and the CSV row number remain. |
| N10, N11 | **Unchanged.** |
| N3 residue | **Grew** (N13, N17). |
| M1 | **Unchanged** (Low). |
| M2 | **Unchanged and not worse** (Medium). Left to SEC-1. |
| M3 | **Unchanged.** Slightly more load on `KEEP_OMITTED_ON_UPDATE` (N15). |
| L1, L3–L5, L7 | **Unchanged.** |
| L2 | **Grew** (N8 prefix). |
| L6 | **Still pending**, with six new items. |
| I1 | **Unchanged** (26/52 unchecked). |

Sizes:

| File | a55b2d0 | a97daf4 |
|---|---|---|
| `main.js` | 1,424 | 1,427 |
| `crudHelpers.js` | 610 | 619 |
| `importParserService.js` | 349 | 405 |
| `bankReconciliationService.js` | 820 | 829 |
| `tallyImportService.js` | 531 | 540 |
| `cracService.js` | 168 | 171 |
| `goLiveService.js` | 294 | 294 |
| `init.js` | 2,124 | 2,124 |

## Owner sign-off needed under AGENTS.md §4

§4 lists "Save/post/reversal behavior", "Existing workflows" and "Existing records". No accounting formula, posting math, GST, valuation, profitability, schema, IPC name, preload or route-key change was made.

Carried over and not shown as approved: **(a)–(v)** from the 92071b3, f833346, 219b2d3 and a55b2d0 reports.

New in a97daf4:
- **(w) Save behaviour, every table using generic create and update.** `true`/`false` are now stored as 1/0 instead of refused. In text columns they are stored as `"1.0"`/`"0.0"`, and a required text field accepts them. Lists, objects, `Date` and `Buffer` are refused with a guided message (`crudHelpers.js:143-159`). This includes transaction tables reached through `createRecord`/`updateRecord` *(inferred)*.
- **(x) Save behaviour on `companies`, `suppliers`, `employees` and `banks`.**
  - A field sent as `null` now **keeps** the stored value, where before it cleared it (`crudHelpers.js:80-83`; Q1).
  - Invisible-only values count as blank. A supplier name that holds only a ZWSP now takes its alias, or is refused as required (`:53, 120`).
  - The supplier bank text is rebuilt only when a part's resolved value changes (`:94`).
- **(y) Approval and review behaviour, bank voucher proposals.** Edit, approve and reject are now all-or-nothing with their two audit rows. A failing audit write now leaves the proposal unchanged, where before it was saved (`bankReconciliationService.js:642-702`). The `audit_log` action text changed, for example "voucher proposal approved" (`:403`).
- **(z) Save behaviour, CRAC and closure.** A write with no audit writer is refused (`cracService.js:10-12`, `orderClosureService.js:37`). The IPC callers pass one. This affects scripts and future callers only.
- **(aa) Existing import workflow.**
  - XLSX sheets over **1,000,000 cells** are refused (was 2,000,000), and the same data as CSV still imports (N13).
  - Shared strings are capped at 32,767 characters per value and 16M characters in total (`importParserService.js:207-228`).
  - CSV cells over 32,767 characters are refused (`:83-104`).
  - Titles and values share one 128M-character budget (`:57-65`).
  - TSV/XLS-text files with more than 400,000 lines are refused, filled or not (`:116-122`; N14).
  - The header row must be within the first 50 filled rows. A row further down is refused only when it looks like a header, and otherwise the sheet is read from row 1 (`:367-380`).
- **(bb) Existing Tally workflow.** The master-migration preview refuses selections over 25 MB in total, including a single file over 25 MB (`tallyImportService.js:444-451`; N16).
- **(cc) Reversal behaviour and the rollback channel.** A go-live rollback refused by the guard now writes a `go_live_rollback_refused` audit row (`main.js:1320`). Any other error from the guard is **thrown** again instead of returned as a refusal (`main.js:1319`). Its shape on `go-live:rollback` therefore changes for the screen, though the channel name does not. This is UI-facing rather than strictly §4, but list it so the owner sees it.

## Test coverage of the new paths

Covered:
- Undefined, null, invisible and conflicting supplier values keep the stored bank parts.
- Lists are refused.
- Overlong shared strings and CSV cells.
- Blank-line TSV, now through the right parser.
- The reply budget.
- Proposal reject rollback when `voucher_proposal_audit` fails.
- A CRAC write with no writer.
- An Excel-row header refusal, and a single-cell data row far down.
- The Tally 25 MB budget.

Not covered:
- The stored value of a boolean (`"0.0"`). The test only asserts no-throw (N12).
- `null` on a keep-omitted master against an ordinary table (N15).
- The same sheet as XLSX and as CSV past 1M cells (N13).
- A filled TSV over 400,000 lines (N14).
- A single Tally file over 25 MB, and the stock preview cap (N16).
- The rollback refusal audit row, and the rethrow of a non-refusal error (N8).
- Explicit `null` as the CRAC writer, and `crac:create` through IPC (N7).
- Proposal approve and update with `audit_log` (not `voucher_proposal_audit`) failing. Probe `v.mjs` shows they roll back.
- The action string for "draft voucher created" and "voucher posted" (N6).
- A one-column header far down (N9). The current test asserts the mis-map.
- The value, row, cell and sheet caps, the real `executeEnhancedReset` in the lost-mark test, and a clean `git status` after a dev run, all carried over.

## Recommended order

1. **N12**: store booleans by column type, or refuse them for TEXT. Fix the test to assert the stored value. This is the only new path that writes wrong data silently.
2. **N13 and N14**: put the XLSX cell cap back in line with the value cap, and count only blank lines in the TSV pre-count. Both are regressions against a55b2d0 in existing import workflows.
3. **N16**: a per-file Tally cap with an actionable message, and the same cap on the stock preview.
4. **N15**: decide what `null` means for every table, and test it.
5. **N8 and N6 residue**: a typed refusal code with one rollback entry point in `goLiveService`, and a fixed proposal action map.
6. **L6**: put (a)–(cc) in the PR for the owner and record the §14 run. Then N17 (`IMPORT_LIMITS`), N9, N7, N18, N10, M1, M3, I1, L1–L5, L7.
7. **M2**: leave it to SEC-1 as planned, and remove `main.js:879` there.

None of these needs a schema, IPC, preload or route-key change. A repair of legacy `".0"` values, whether from bank numbers (q) or from booleans stored since this commit (w), would touch existing records and needs §4 approval first.
