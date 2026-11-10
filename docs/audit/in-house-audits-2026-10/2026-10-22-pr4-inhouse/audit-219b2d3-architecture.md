# Architecture and Sustainability Audit: commit 219b2d3

Repo `/home/claude/gii-gem-erp`, HEAD `219b2d3` ("Close the f833346 audit findings"). Scope: `git diff f833346 219b2d3`, 10 files, +121/-41. Baseline: `audit-f833346-architecture.md` (M1–M3, L1–L7, I1–I4). This was a read-only review. Nothing in the repo was edited, and `git status --porcelain` was empty before and after. Written 2026-10-29.

Scratch probes are in `/tmp/audit219-arch/probe/`:
- `p.mjs` covers the supplier aliases, bank trimming, the go-live guard (real `executeEnhancedReset` and `rebuildZeroState`) and the CRAC audit rows.
- `num.mjs` covers numeric bank values.
- `imp.mjs` covers the import caps, the header-search window and the XLSX text caps.

They run against the real `init.js`, the reset, go-live and CRAC services and the import parser, on throwaway databases.

Checks run:
- `npm run test:integrity` passed: **87/87 Node tests and 19/19 IPC tests**. At f833346 it was 86 + 19. No ABI rebuild was needed.
- `npm run lint:syntax` passed (exit 0). The script is unchanged, so it still skips four of the five service files changed here (I1).
- I did **not** run the AGENTS.md §14 set (`build`, `verify:accounting`, `verify:financials`, `verify:voucher-inventory`). Those scripts use the dev database, and this audit was read-only. The commit does not show that anyone ran them (L6).

Claims marked *(inferred)* come from reading the code and were not run. Every other behaviour claim was run in a probe.

## Verdict

**Rating: Sustainable with conditions. Better than f833346. No High finding.**
- M3 drops to Low, because `null` and blank aliases no longer erase anything.
- M1 stays Low, with three of its five items done.
- M2 is unchanged.
- One new Medium (N1): bank values are normalised in the wrong layer, and numbers are not handled.
- Three new Lows: N2 (CRAC audit in `main.js`), N3 (the import caps) and N4 (the header window).

What improved:
- **One presence rule (`hasValue`)** is used by the update alias loop, the bank-part check and the create normalizer. Probe S1 (`{branch:null}`) and S2 (whitespace alias) now leave the record unchanged.
- **The update alias map is derived** from `SUPPLIER_FIELD_ALIASES`, so the two maps cannot drift.
- **The comment is back above `SUPPLIER_BANK_PARTS`.**
- **The lost-mark rollback now counts from the run's start (`auditIdAtStart`)**, not from its reset row.
  - G1 (real reset plus zero-state, no work) is allowed. The real reset writes only one audit row, with `table_name = 'system'`.
  - G2 and G3 are refused.
  - **G9 is new and now refused.** In G9 a master is entered after the run started but before its reset. Masters survive the reset, so under f833346's mark (the reset row) that work was invisible, and a rollback would have erased it.
- **`GO_LIVE_RESET_MODULE`** is exported once and used by the reset, the guard and the test.
- **CRAC and order-closure writes now leave audit rows**, so the guard's rule that "every record write leaves an audit row" now also holds for the two services that lacked one. A file-level scan finds no other service writing without `auditLog`, apart from seeding and migration.
- **Import parser**:
  - Blank header cells are dropped in every format, which fixes L5(b). Probe I3: 51 named columns plus 450 blank ones now parse as 51.
  - The CSV and HTML parsers stop during reading once past 200,000 rows.
  - XLSX has a per-cell cap (32,767 characters) and a 64-million-character sheet cap. These close the shared-string amplification (X3 and X4 are refused in 0–5 ms).
- **The wizard shows the outcome's reason** (`rollbackResult.reason`), not the reason the caller passed in.
- **`.gitignore` now covers every runtime file I could find.** `git check-ignore` matches `config/alerts.json`, `database/pending_restore.json`, `pending_restore.db`, the database and WAL files, `deployment/`, `environment-config.json`, logs, exports, documents, backups and reports.

AGENTS.md compliance:
- `App.jsx` was not touched.
- No IPC channel, preload method, route key or schema was changed.
- The new refusals are guided.

What remains:
1. **Bank values are normalised inside the permission guard, after the bank text is built, and only when they are strings (N1).** The stored bank text keeps the padding and the zero-width characters. A no-op resend can count as a bank change. A numeric account number is stored as `"12345678.0"`.
2. **Two actor mechanisms, and writes with no actor skip the bank gate** (M2, unchanged).
3. **The CRAC audit sits in IPC handlers and outside the write's transaction** (N2).
4. **The value cap went from 5M to 12M.** That is 2.9 s and about 246 MB of heap on the main process. The only stated reason is a test fixture (N3).
5. **§4 sign-offs and §14 runs are not shown** (L6). Six new items are listed below.

## Design choices asked about

| Choice | Judgement |
|---|---|
| **Shared `hasValue`** (`crudHelpers.js:50`) | **Right idea, half applied.** It now decides presence at `:84`, `:92` and `:119`, and `null`, `undefined` and blank text are consistently "not sent". Three gaps remain. (a) **"0 counts" was chosen without asking what the field is.** For bank identifiers a numeric value is never right: it has lost its leading zeros, and better-sqlite3 binds JS numbers as REAL. Probe S5: `{account_number: 0}` now writes `supplier_account_number = "0.0"`, and the rebuilt bank text says `Account Number: -`, because the text builder at `:126` still uses `\|\|`. f833346 blanked the field. 219b2d3 writes a wrong value and logs `bank_details_changed`. (b) **The "same value" test is still split.** `differs` (`:89`) and `supplierBankPartsChanged` (`:100`) use `.trim()`, and `bankDetailsPolicy.text()` uses `EDGE_SPACE`, which also strips U+200B–U+200D. Probe S9: re-sending the stored IFSC with a trailing U+200B rewrote `bank_details` with the invisible character inside it, logged `bank_details_changed`, and would have asked a non-admin for the settings permission on a no-op. (c) `supplier_account_name \|\|=` (`:121`) is a fourth rule, but it is harmless (S12). |
| **Derived `SUPPLIER_UPDATE_ALIASES`** (`:66`) | **Correct, and it closes the drift risk.** `filter(field !== "supplier_name")` is clear. A new alias added to the create map now reaches update automatically. Not done from the f833346 fix list: the test that no alias maps to two columns in the update map, the decision on `account_name` on update (S3 is still silently dropped), a derived `KEEP_OMITTED_ON_UPDATE` and `domain/supplierFields.js`. The new comment "the column wins" (`:88`) holds only for the bank-text check. In the normalizer, a **blank** column loses to an alias. Probe S6: `{supplier_branch: "", branch: "AliasWins"}` stored `AliasWins`. That is defensible, but it is the opposite of the comment. |
| **Trimming bank values in the guard hook** (`init.js:1753`, `trimBankFields`) | **Right goal, wrong layer.** (1) **Order.** `cleanPayload` builds `bank_details` from the untrimmed parts (`crudHelpers.js:122-128`), and only then does `guardSensitiveWrite` trim the columns. Probe S11 (create with `" 123456 "` and `"​SBIN0000001"`) stored clean columns, but the text was `Account Number:  123456 ; … IFSC: ​SBIN0000001`. S10 (padded alias on update) did the same. (2) **Hidden side effect.** A function named "guard" that returns a list of changes now also rewrites the row. `createCrudHelpers` defaults `guardSensitiveWrite` to `() => []` (`crudHelpers.js:17`), so any other composition of the helpers (tests, scripts, a future second database) silently loses the normalisation. (3) **Strings only.** `typeof row[field] === "string"` skips numbers, so probe N1 stored `12345678` as `"12345678.0"`. N3: re-sending the same number logged `bank_details_changed` on every save. That number path predates this commit, but this commit is where the normalisation was meant to be settled. (4) The mutation is safe for callers: `row` is the fresh `cleaned` object, never the caller's payload. **Fix:** move it to `normalizeBankFields(table, payload)` in `bankDetailsPolicy.js`. Turn finite numbers into text without the `.0` (or refuse a numeric account number with a guided message), then strip `EDGE_SPACE`. Call it at the start of `cleanPayload`, before the text is built, and let the guard only check. Export `text()` as `sameBankValue()` and use it in `differs` and `supplierBankPartsChanged`. |
| **CRAC audit wrappers in `main.js`** (`:1358-1376`) | **They close the guard's blind spot, but this is the wrong home.** Probe C2: a wrapper-style row with no company still trips the rollback guard, which does not filter audit rows by company. So the guard benefit is real. Problems: (a) **Not atomic.** The service writes (an INSERT or UPDATE, then a `supply_orders` UPDATE), and `auditLog` runs afterwards with no transaction around them. If the audit write throws, the record is saved but the user sees an error and may retry, which duplicates a CRAC create *(inferred)*. Atomicity is the rule f833346 set for the reset row. (b) **No `company_id`.** `crac_records` and `supply_orders` both carry one, but the audit rows store `NULL`, so per-company audit views and exports leave CRAC work out (§9). (c) **Incomplete trail.** Create, update and delete also rewrite the order's `crac_*` columns, but only `crac_records` is named. The delete row has no `old_value`, because `deleteCracRecord` returns nothing. (d) **Placement.** Any caller other than IPC, such as a script, a later service or a test, still writes with no audit. This is a fourth audit style next to crudHelpers, the services that call `auditLog` themselves, and the go-live handler. **Fix:** do it inside `cracService.js` and `orderClosureService.js`. Wrap each write in `db.transaction`, call `auditLog` with `company_id`, `old_value` and the order change, and drop the wrapper. Or inject `auditLog` the way crudHelpers receives it. Add a test that every exported service write leaves an audit row naming its table. |
| **`GO_LIVE_RESET_MODULE`** (`operationalResetService.js:341`) | **Correct and complete for the literal.** Both the reset and the two guard queries use it, and so does the test. The constant's name says "go-live" but its value is `go_live_preparation`. That is acceptable, because stored rows need the old value. Still open from M1: the test writes the row with `m.auditLog(...)` (`audit2-regressions.test.mjs:110`) instead of running `executeEnhancedReset`, so a change to the reset's row shape (for example `table_name`) is not caught. Probe G0 shows the real reset row is `{operational_reset, go_live_preparation, system}`, which is the same today. |
| **Lost-mark count from run start** (`goLiveService.js:239`) | **Correct, and stricter than before** (G9). The only thing the start-based mark adds is the run's own reset row, which is ignored because `system` is not a table. The `reset` lookup is now only an existence check. That is fine, but the variable name and the comment above it ("The reset's own audit row … is the mark instead") now describe the old design. |
| **Import caps and header-search limit** (`importParserService.js:22-25, 81, 104, 173-179, 294`) | **The new text caps and the in-read row stop are good. The value-cap raise and the header window need a reason.** (a) **12M values**: probe I1 (300 × 40,000, 24 MB CSV) parsed in **2.9 s with about 246 MB heap** on the Electron main process. At 5M it was 1.4 s and 54 MB. The commit's only justification is the new test (300 × 30,000), and no real import sheet has been shown to be that wide. The renderer preview then receives the same records through structured clone *(inferred)*. (b) **Row counting differs by format.** `parseDelimited` counts raw `\n` (`:81`), so 2 data rows followed by 200,001 blank lines are refused as "more than 2,00,000 rows" (I4). The CSV parser counts only non-empty rows and accepts the same file (I5). (c) **Limits are now in four groups** in one file (`:22-25`, `:173-176`, `:178-179`, plus `MAX_XLSX_CELLS`), and they mix number formats ("2,00,000" from `en-IN` against "2,000,000" and "32,767"). (d) The row cap and the value cap still have no test of their own. The XLSX text caps have none either. (e) The new 9M-value test adds about 2 s to every `test:integrity` run. |
| **`MAX_HEADER_SEARCH_ROWS` = 50** (XLSX only) | **It bounds a cost that was already small, and it brings back a silent mis-map.** The search was a `findIndex` over at most 2M cells. Probe X1: a sheet with its header at row 60 now uses `preamble_line_1` as the only column and returns 60 junk records with no message (§12 "block unsafe import"). The same sheet with its header at row 50 parses correctly (X2). **Fix:** when no header is found in the window, refuse with a guided message ("No header row with supplier_name, item_name, order_number or company_name was found in the first 50 rows; delete the title rows above the header and retry"). Do not fall back to row 0. |
| **GoLiveWizard message** (`GoLiveWizard.jsx:172-173`) | **Correct minimal fix, and it is not `App.jsx`.** Text on failure: `executeAutoRollback`'s reasons already start with "Rollback refused:" or "Rollback failed:", so the screen now says "Rollback failed: Rollback failed: …". That reads clumsily but is accurate. "Pending restore already queued" is still an unguided reason (§13). On success the screen shows the reason the caller passed in, which is fine. **Not done (M1 item 3):** there are still two refusal shapes. A guard refusal *throws* and lands in `handleError(err, 8)`. A service refusal *returns* and lands in `setError`. `failGoLiveWithRollback` still takes `db` and `userId` and does not use them. |
| **New `.gitignore` entries** (`.gitignore:51-53`) | **Correct and sufficient for today.** `database/*.json` has a middle slash, so git anchors it to the root: `src/main/database/x.json` is *not* ignored (checked). `/config/` ignores a whole top-level folder. No source lives there now, but a later `config/` for source files would be silently untracked. `/config/alerts.json` would be narrower. `database/*.db-journal` is not ignored (WAL mode is used, so this matters little). **The root cause is unchanged**: the dev runtime root is still the checkout (`main.js:197`), and nothing tests that a dev run leaves `git status` clean. This is the fourth runtime file ignored by hand in four commits. |

## Findings

| # | Finding | Sev | Evidence (file:line) | Why it matters | Fix | Effort |
|---|---|---|---|---|---|---|
| N1 | **Bank values normalised in the guard, after the bank text is built; numbers not handled** | **Med** (new) | `init.js:1753` (trim inside `guardBankDetailWrite`). `crudHelpers.js:122-128` (text built earlier from the raw parts, with `\|\|` so 0 shows as "-"). `:89` and `:100` use `.trim()`, while `bankDetailsPolicy.js:25` uses `EDGE_SPACE`. `bankDetailsPolicy.js:35` handles strings only. `crudHelpers.js:17` defaults the guard to a no-op. Probes: S5 `{account_number:0}` stored `"0.0"`. S9 a ZWSP resend rewrote `bank_details` and logged `bank_details_changed`. S10 and S11 left padding and ZWSP inside the bank text. N1/N3 stored a number as `"12345678.0"`, and every resend logged a bank change. | Bank details decide where money goes. The stored text and the columns can disagree, a no-op save can hit the admin-only gate, and a numeric account number is saved wrong. The normalisation is invisible to anyone reading `cleanPayload`. | (1) Add `normalizeBankFields(table, payload)` to `bankDetailsPolicy.js`: finite number to `String(n)`, or a guided refusal for a numeric account number or IFSC; then strip `EDGE_SPACE`. Call it at the start of `cleanPayload`, before the text is built. Remove the trim from the guard. (2) Export `sameBankValue(a, b)` (today's `text()` compare) and use it in `differs` and `supplierBankPartsChanged`. (3) In the text builder use `hasValue(x) ? x : "-"`. (4) Tests: S5, S9, S11 and N3. | S |
| N2 | CRAC and closure audit: in IPC, not atomic, no company | Low-Med (new) | `main.js:1358-1376`. `cracService.js:56-113` and `orderClosureService.js:36-40` still write with no audit and no transaction. Probe C2: the stored `company_id` was `NULL`. | The rollback guard and the audit trail depend on these rows. A direct caller skips them. A failed audit write after a committed write invites a duplicate retry. Company audit views leave CRAC work out. | Move into the services. `db.transaction(() => { write; auditLog({company_id, table_name, record_id, old_value, new_value}) })()`, plus a second row for the `supply_orders` change (or name both tables). Remove `auditCrac`. Add a test that the CRAC create, update and delete and the closure mark leave audit rows with the company. | S |
| N3 | Import limits: value cap raised to 12M on a test's account; row counting differs by format; limits scattered | Low (new) | `importParserService.js:24` (12M), `:81` (raw-newline count) against `:66`/`:104` (non-empty rows), `:22-25` and `:173-179`. Probe I1: 2.9 s and +246 MB. I4 refused, while the same rows as CSV (I5) passed. Test `audit2-regressions.test.mjs:366`. | It is a main-process stall and a memory peak, and the user gets a wrong refusal message for a blank-padded TSV. Each new cap is added in a new spot. | (1) Keep 5M (or 6M) unless a real sheet needs more. Size the test to 300 × 15,000. (2) In `parseDelimited`, count non-empty lines while splitting, the same as the CSV parser. (3) Put all limits in one frozen `IMPORT_LIMITS` object and format every number one way. (4) Tests for the row cap, the value cap and both XLSX text caps. | XS |
| N4 | XLSX header window falls back to row 0 silently | Low (new) | `importParserService.js:294-302`. Probe X1: header at row 60 gave 60 junk rows. | A silent wrong mapping at the import's first step (§12). | A guided refusal when no header is found in the first 50 rows (wording above). Add a test. | XS |
| M1 | Rollback guard: residual coupling | Low (unchanged sev) | Done: the constant, the wizard field, and a start-based mark (G9). Open: the test still writes the reset row by hand (`audit2-regressions.test.mjs:110`). There are still two refusal shapes (throw against return). `failGoLiveWithRollback(…, db, userId)` has unused parameters (`goLiveService.js:279`). The legacy `created_at` branch has no removal date (`:199`). The comment at `:233-235` describes the old mark. "Pending restore already queued" is not guided. | Drift risk and two UI paths for one decision. | (1) Run `executeEnhancedReset` in the lost-mark test. (2) In the `go-live:rollback` handler, catch the guard error and return `{rollbackResult:{success:false, reason}}`. (3) Drop the unused parameters. (4) Add `// remove after 2027-01-31` to the legacy branches. (5) Update the comment. (6) Guide the pending-restore message ("A restore is already queued; restart the app to apply it, or cancel it in Backup & Restore"). | XS |
| M2 | Two actor mechanisms; writes with no actor skip the bank gate | **Med** (unchanged) | `main.js:234` `let currentActor`. `init.js:1756` `if (changes.length && actor)`. `imports:parse-file` and `parse-buffer` still call `enforcePermission` directly (`main.js:923, 930`). | As before. The CRAC wrappers add one more audit path that relies on the ambient actor. | As before: `actorId = () => currentActor()?.id ?? null`, a `runAsSystem` wrapper, and refuse a write with no actor unless it runs inside `runAsSystem`. Route both import handlers through `guarded("import", "imports", …)`. | S |
| M3 | Supplier update aliases: residue | **Low** (was Med) | Fixed: one presence rule, `null` and blank aliases keep stored values (test at `audit2-regressions.test.mjs:158`), a derived map, the comment moved. Open: `account_name` is silently ignored on update (S3). "Column wins" is untrue for a blank column (S6). There is no one-column-per-alias test, `KEEP_OMITTED_ON_UPDATE` is hand-typed (`crudHelpers.js:73`), and there is no `domain/supplierFields.js`. The `0` case moved to N1. | The erase class is closed. What remains is silent drops and comments that do not match the code. | (1) Refuse `account_name` on update with a guided message, or map it to `supplier_account_name`, and record the decision. (2) Fix the comment, or make a blank column win in the normalizer too. (3) Add the alias-uniqueness test. (4) As before: derive the keep-omitted set and move the supplier field model to `domain/supplierFields.js`. | XS-S |
| L1 | Master-data bank check still in `main.js` | Low-Med | Unchanged. | As before. | As before. | S |
| L2 | Guided bank message matches on error text | Low | Unchanged (`init.js:1773`). | As before. | Typed `code`/`reason` on the permission error. | XS |
| L3 | Rollback deny-lists | Low | Unchanged. `READ_ONLY_AUDIT_ACTIONS` is still a hand list. There is still no test for `bank_statement_direct_post_blocked`. The new `crac_*` and `order_operationally_closed` actions correctly *do* block rollback. | Each new read or refusal action needs an edit here. It fails closed. | As before: a `mutates: false` flag in the `audit-graph.json` catalog, with a parity test. | XS-S |
| L4 | History recovery and backup gaps | Low | Unchanged. | As before. | As before. | S |
| L5 | Parser: silent loss and copies | Low (partly fixed) | Fixed: blank-header consistency (I3), the in-read row stop, the cell and sheet text caps. Open: `</td >` and `</tr >` still lose rows, the narrow entity decoding, the second `td\|th` walker, the renderer fallback parsers with no caps, and no tests for upper-case HTML, a non-`sheet1` workbook or shared strings. | AGENTS.md §12. | As before. The limits and tests are covered under N3. | XS-S |
| L6 | §4 owner sign-offs and §14 runs not shown | Low | Carried over: (a)–(i). New in this commit: (j)–(o), listed in the next section. | AGENTS.md §4, §17. | List (a)–(o) in the PR for the owner's "go". Run and record §14 plus `verify:voucher-inventory` and `verify:controls`. | XS |
| L7 | Dev runtime root is the checkout | Low (narrowed) | Every runtime file found is now ignored (checked with `git check-ignore`). The root cause is unchanged (`main.js:197`). `/config/` is broad. `database/*.db-journal` is not ignored. | The next new runtime file will repeat this. | Default the dev root to `<checkout>/runtime/` (already ignored), with `GII_GEM_ERP_DATA_ROOT` as the override. Narrow `/config/` to `/config/alerts.json`. Add a test that runs the suite with the root set to a temp copy of the checkout and asserts `git status --porcelain` is empty. | XS |
| I1 | Lint list still misses the changed files | Info | `lint:syntax` still skips `crudHelpers.js`, `goLiveService.js`, `importParserService.js`, `operationalResetService.js`, `cracService.js` and `orderClosureService.js`. | Carried over. | `node --check` over a glob of `src/main/**/*.js`. | XS |
| I2–I4 | Small items | Info | Unchanged. | — | As before. | XS |

## Previous findings (audit at f833346): status at 219b2d3

| # | Status |
|---|---|
| M1 | **Partly fixed, still Low.** Done: (1) `GO_LIVE_RESET_MODULE`, and the wizard reads `rollbackResult.reason`. Extra: a start-based mark (G9). Not done: (2) the test runs the real reset; (3) one refusal shape; (4) the unused parameters; (5) the legacy removal date. |
| M2 | **Unchanged.** |
| M3 | **Mostly fixed, now Low.** Done: (1) `hasValue` at the three named sites; (2) the derived map; (4) the comment; (5) the S1-style `null` test. Not done: (2b) the uniqueness test; (3) `account_name` on update; (5) the `0` test, where `0` now writes `"0.0"` (moved to N1); (6) `supplierFields.js` and the derived keep-omitted set. |
| L1, L2, L4 | **Unchanged.** |
| L3 | **Unchanged.** The test for `bank_statement_direct_post_blocked` is still missing. |
| L5 | **Partly fixed.** Blank headers are consistent and the text caps are in. The limit grouping and the cap tests are not done. |
| L6 | **Still pending**, with six new items (j–o). |
| L7 | **Mostly fixed for the known files.** The root cause and the clean-tree test remain. |
| I1 | **Unchanged.** The gap now also covers `cracService.js` and `orderClosureService.js`, which are logically part of this change. |
| I2–I4 | **Unchanged.** |

Sizes: `main.js` went from 1,416 to 1,426 lines. `crudHelpers.js` went from 604 to 602, `importParserService.js` from 300 to 327, and `goLiveService.js` from 289 to 291. `init.js` is 2,124.

## Owner sign-off needed under AGENTS.md §4

§4 lists "Save/post/reversal behavior", "Existing workflows" and "Existing records". No accounting, GST, valuation, schema, IPC, preload or route-key change was made.

Carried over and not shown as approved: **(a)–(i)** from the 92071b3 and f833346 reports. These cover the supplier update alias semantics (three changes), rollback refused when no reset row is found, an `auditLog` failure aborting a reset, and `imports:parse-file` needing the `import` permission.

New in 219b2d3:
- **(j) Save behaviour, suppliers.** `0` and other non-blank numbers now count as a value under an alias, on create and on update. On create, a whitespace-only primary field is now filled from its alias. Before, it was kept.
- **(k) Save behaviour, and existing records.** Bank columns of companies, suppliers, employees and banks, including `bank_details`, are trimmed of edge whitespace and zero-width characters on every save. Existing padded values change on their next unrelated save. Through N1, such a save can show as a bank change.
- **(l) Audit and reversal behaviour.** CRAC create, update and delete and the order-closure mark now write audit rows. Through the guard, any CRAC edit or closure after go-live now blocks the go-live rollback.
- **(m) Reversal behaviour.** A lost-mark rollback now counts from the run's start, so work entered between the start and the reset blocks the rollback (G9).
- **(n) Existing import workflow.**
  - The value cap rose from 5M to 12M.
  - The row cap is now enforced while reading. For TSV and HTML-in-.xls, blank lines count toward it.
  - Blank-header columns are dropped in CSV, TSV and HTML.
  - XLSX header detection looks only at the first 50 rows, and a lower header is silently not found.
  - New refusals: cells over 32,767 characters, and sheets over 64M characters.
- **(o) Rollback screen text** changed (`GoLiveWizard.jsx`). This is UI-only and not strictly §4, but list it so the owner sees the new wording.

## Test coverage of the new paths

Covered:
- A `null` alias keeps the account number.
- The column wins over a disagreeing alias.
- An unchanged resend keeps the bank text.
- A padded IFSC is stored trimmed. This uses U+2028, which `.trim()` also strips, so the U+200B path is untested.
- A lost mark, then a later reset, then earlier work.
- A run stopped before its reset, then a separate Enhanced Reset (the row is written by hand).
- 300 × 30,000 with trailing blank headers.

Not covered:
- `0` and numeric bank values (S5, N1).
- A ZWSP resend (S9).
- The bank text built from padded parts (S11).
- A blank column plus an alias (S6).
- G9 (master entered between start and reset).
- The real `executeEnhancedReset` in the guard test.
- The CRAC and closure audit rows, and their company.
- The row cap, the value cap, the cell and sheet text caps, the header beyond row 50, and TSV blank lines.
- `git status` clean after a dev run.

## Recommended order

1. **N1**: one `normalizeBankFields` in `cleanPayload`, before the text is built; numbers handled; one equality rule; tests S5, S9, S11 and N3.
2. **N2**: move the CRAC and closure audit into the services, transactional and with the company.
3. **N4 and N3**: a guided header refusal; restore a 5–6M value cap (or justify 12M with a real sheet); one row-count rule; `IMPORT_LIMITS`; cap tests.
4. **M1 residue**: the real reset in the test, one refusal shape, the unused parameters, the dates.
5. **M2**: one actor source, `runAsSystem`, refuse writes with no actor, the import handlers through `guarded`.
6. **L6**: put (a)–(o) in the PR for the owner and record the §14 run. Then L7's root fix, M3's residue, L3, L5, I1–I4, L1, L2 and L4.

None of these needs a schema, IPC, preload or route-key change.
