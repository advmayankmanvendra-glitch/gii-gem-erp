# Architecture and Sustainability Audit: commit f833346

Repo `/home/claude/gii-gem-erp`, HEAD `f833346` ("Close the 92071b3 audit findings"). Scope: `git diff 92071b3 f833346`, 8 files, +128/-55. Baseline: `audit-92071b3-architecture.md` (M1–M3, L1–L7, I1–I4). This was a read-only review. Nothing in the repo was edited, and `git status --porcelain` was empty before and after. Scratch probes are in `/tmp/auditf83-arch/probe/`: `p.mjs` covers the supplier aliases and the go-live guard, and `imp.mjs` covers the import caps. They run against the real `init.js`, `operationalResetService.js`, the go-live services and the import parser, on throwaway databases. Written 2026-10-22.

Checks run:
- `npm run test:integrity` passed: **86/86 Node tests and 19/19 IPC tests**. At 92071b3 it was 85 + 19.
- `npm run lint:syntax` passed (exit 0).
- I did **not** run the AGENTS.md §14 set (`build`, `verify:accounting`, `verify:financials`, `verify:voucher-inventory`). Those scripts use the dev database, and this audit was read-only. The commit does not show that anyone ran them (L6).

Claims marked *(inferred)* come from reading the code and were not run. Every other behaviour claim was run in a probe.

## Verdict

**Rating: Sustainable with conditions. Clearly better than 92071b3. No High finding. M1 drops to Low. M3 is narrowed again but stays Medium because of one new data-loss path. M2 is unchanged.**

What improved:
- **The rollback guard is now tied to this run's own reset.** Each run stores `auditIdAtStart` and `companyId` when its history entry is created. The fallback mark is the *first* `operational_reset` row with module `go_live_preparation` for that company after that id.
  - Probe G2 (the old A2 fail-open: work entered, then a standalone reset) is now **refused**.
  - Probe G3 (work entered, then a second go-live-module reset) is refused.
  - An audited edit of a master with no new row (G5) is refused.
  - A clean lost-update run (G1) is allowed.
- **The reset and its audit row are now one transaction.** Probe G8 put a trigger on `audit_log` that fails the reset's row. The whole reset rolled back, and the company's orders were kept (1 before, 1 after). The hash chain update is now atomic with the reset too.
- **One refusal check (`rollbackRefusalReason`)** feeds both the guard and the service. A completed run with no mark now gets "is completed" (G6, the old probe C). An unknown id gets "not found" (G7).
- **Supplier aliases on update are one-to-one.** `beneficiary_account_name` no longer renames the supplier. Blank and whitespace aliases no longer blank stored values (probe S2, plus the new test).
- **The import parser has shape caps**: 500 header columns, 200,000 rows, 5,000,000 values. All three give guided refusals. The 20,000-column header now fails in under 1 ms.
- `imports:parse-file` now needs the `import` permission, the same as `parse-buffer` and `bank:create-import`.
- `bank_statement_direct_post_blocked` no longer blocks rollback.
- `environment-config.json` is no longer tracked, and it is ignored.

AGENTS.md compliance:
- `App.jsx` was not touched.
- No IPC channel, preload method, route key or schema was changed. The new entry fields live in the JSON history, not the database.
- All new refusals are guided.

What remains:
1. **`null` (and numeric `0`) sent under an alias still erases the stored value** (M3, new path). The new rule asks whether `String(v).trim()` is non-empty, and `String(null)` is `"null"`. The normalizer uses a different test (`find(Boolean)`). The two rules disagree, so `{ branch: null }` blanked `supplier_branch` and left `bank_details` stale.
2. **Two actor mechanisms, and writes with no actor are not checked.** Unchanged (M2).
3. **The dev runtime root is still the checkout.** Two more runtime files are neither tracked nor ignored: `config/alerts.json` (SMTP and WhatsApp settings, including the encrypted secrets) and `database/pending_restore.json` (L7).

## Design choices asked about

| Choice | Judgement |
|---|---|
| **Rollback mark keyed on audit position and company** (`auditIdAtStart`, `companyId`, `resetAuditIdFor`) | **Right design. This closes M1's main defect.** An id is a total order that the database owns. `audit_log.id` is `INTEGER PRIMARY KEY AUTOINCREMENT` (`schemaDefinitions.js:593`), so ids are never reused, even after rows are deleted. Clock skew and second truncation no longer matter for new entries. `ORDER BY id LIMIT 1` (earliest after start) is the correct choice, and with it the company filter is mostly defence in depth. It is not redundant, though: two go-live runs for different companies could interleave *(inferred; only one run is in progress at a time in the wizard)*. `resolveResetCompany` refuses a reset with no company, so a run that did reset always carries a `companyId`. The `(? IS NULL OR …)` branch only applies to entries with no company, which never reset. Remaining weak points: (a) the module name `'go_live_preparation'` is a string literal in two files (`operationalResetService.js:340`, `goLiveService.js:195,204`). If either side is renamed, the guard says "no record of a reset" for every run. It fails closed, but the guidance would be wrong. (b) The test writes the row with `m.auditLog(...)` instead of running `executeEnhancedReset`, so it would not catch that drift. My probe G0–G3 runs the real reset, and it passes. (c) The legacy branch for entries written before 2026-10-23 still compares `created_at` text. It is now filtered and earliest-first, which is acceptable for a path that is going away. Add a removal note with a date. |
| **Reset audit row written inside the reset transaction** | **Correct. It closes M1(d).** The row is the evidence the guard relies on, so it must commit with the reset or not at all (G8). `auditLog` checks `companies` and `users` for existence and reads the previous hash inside the same transaction, which is consistent. The transaction now also computes the `after` counts and `zeroState`. That is cheap (`COUNT(*)` per table) and keeps the stored `after` equal to what was committed. One side effect: an `auditLog` failure now aborts the reset, where before it left a reset with no record. That is the safer failure, and the error text reaches the user unchanged *(inferred: it is not wrapped in a guided message)*. |
| **Shared refusal check** (`rollbackRefusalReason`) | **Good extraction, but two refusal shapes remain.** The guard throws, and the service returns `{ rollbackResult: { success: false, reason } }`. On the IPC path the guard always runs first (`main.js:1313`), so the service's returned refusal is now reachable only by a direct caller. That is fine as defence in depth. But the wizard handles the returned shape wrongly (`GoLiveWizard.jsx:171-172`): it shows `rollback.reason`, which is the *caller's* reason ("Production verification failed"), not `rollback.rollbackResult.reason`. Any returned refusal or real restore failure is shown as "Rollback failed: Production verification failed". This was already so before this commit. The thrown shape actually displays better today. The guard is still outside the service and still reads the history file a second time. That cannot race in a single process, but it is two reads of one decision. `failGoLiveWithRollback(…, db, userId)` still takes two parameters it does not use. |
| **`SUPPLIER_UPDATE_ALIASES` next to `SUPPLIER_FIELD_ALIASES`** | **The idea is right (update aliases are one-to-one), but the form is a hand copy.** The new map is exactly `SUPPLIER_FIELD_ALIASES` without its `supplier_name` entry, all 8 rows retyped. If someone adds an alias to the create map and forgets the update map, the new alias is silently ignored on update. That fails safe, so no data is lost, but the user's value is dropped without a message. The same thing already happens to `account_name`: on create it names the supplier (S7), and on update it is silently ignored (S3). The comment "The account name is left out…" (`crudHelpers.js:61`) belongs to `SUPPLIER_BANK_PARTS` and now sits above the wrong map. The "non-empty" test is also defined three different ways: `String(v).trim()` (alias loop, where `null` → `"null"`), `String(v ?? "").trim()` (the `partChanged` check) and `find(Boolean)` (the normalizer, where `0` is falsy). **Probe S1**: `{ branch: null }` blanked `supplier_branch` ("Mumbai" → ""), and `bank_details` was not rebuilt. **Probe S5**: `{ account_number: 0 }` blanked `supplier_account_number`. |
| **Import shape caps** (`MAX_IMPORT_COLUMNS` 500, `MAX_IMPORT_ROWS` 200k, `MAX_IMPORT_VALUES` 5M in `toRecords`) | **Good: one choke point for all four formats, with guided messages.** All four record builders now go through `toRecords`, so a new format that uses it inherits the caps. Probes: 500 × 10,000 (exactly 5M values) parsed in 1.4 s and about 54 MB of heap. 501 columns and 200,001 rows were refused at once. A 200k × 25 CSV is refused earlier by the 25 MB byte cap, so the row cap matters mainly for narrow sheets and for XLSX (whose inflate is already capped per entry). Weak points: (a) The caps are checked *after* the whole matrix is parsed. That is bounded by the byte cap and the inflate cap, so it is acceptable, but it is not a streaming bound. (b) Blank header cells count toward the CSV, TSV and HTML column cap but are filtered out for XLSX (probe I4: 51 named columns plus 450 blank ones in a CSV were refused, while the same sheet as XLSX would pass). (c) The limits live in two places in one file (`MAX_IMPORT_BYTES` at `:159`, the new caps at `:22-24`), and the browser-fallback parsers (`renderer/utils/importParsers.js`, `fileParsers.js`, `BankStatementScreen.jsx`) have none. They are used only outside Electron. (d) Only the column cap has a test. |
| **Untracking `environment-config.json`** | **Correct.** One correction to the previous report: L7 said the file was "neither tracked nor ignored". It was in fact **tracked** since `e9ca560` (`git ls-tree 92071b3` lists it), so this commit had to remove it, not just ignore it. Side effects: when developers pull, git deletes their working copy if it is unmodified. If they changed the environment in Environment Manager, git refuses the pull until they stash or move the file *(inferred: standard git behaviour)*. With no file, `readEnvironmentConfig` falls back to Development/Development and the go-live precondition reports "Config file not found". Both are fine in dev. Packaging is unaffected (`build.files`). No script reads the file. **But the root cause is untouched**: `config/alerts.json` and `database/pending_restore.json` are also written to the dev runtime root, and `git check-ignore` matches neither (L7). |

## Findings

| # | Finding | Sev | Evidence (file:line) | Why it matters | Fix | Effort |
|---|---|---|---|---|---|---|
| M1 | Rollback guard: residual coupling | **Low** (was Med; main defect fixed) | Fixed: G1–G8 all behave correctly. Remaining: `'go_live_preparation'` repeated as a literal (`operationalResetService.js:340`, `goLiveService.js:195,204`). The guard is called only from IPC (`main.js:1313`). Two refusal shapes, and the wizard shows the wrong field for the returned one (`GoLiveWizard.jsx:172`). The test fixture writes the reset row by hand (`audit2-regressions.test.mjs:113,118`). The legacy `created_at` branch has no end date. The params `db, userId` of `failGoLiveWithRollback` are unused. | Rollback restores a whole-database backup. The guard is now sound. What remains is drift risk and misleading text on the screen. | (1) Export `GO_LIVE_RESET_MODULE` from `operationalResetService.js` and use it in both places. (2) Make the lost-mark test run `executeEnhancedReset` (as `p.mjs` does) instead of `auditLog`. (3) Return one shape from the IPC handler: catch the guard's error and return `{ rollbackResult: { success: false, reason } }`, or make the service throw. In `GoLiveWizard.jsx`, show `rollback.rollbackResult.reason`. This is not `App.jsx`. (4) Drop the unused parameters. (5) Add `// remove after <date>` to the legacy branch. | XS |
| M2 | Two actor mechanisms; writes with no actor skip the bank gate | **Med** (unchanged) | `main.js:234` still has `let currentActor`. `init.js:1754` still has `if (changes.length && actor)`. New in this commit: `imports:parse-file` uses `enforcePermission(... sessionUser(event) ...)` directly instead of `guarded(...)`, a third style of permission call (`main.js:923`, and also `:930`). | As before. | As before: `actorId = () => currentActor()?.id ?? null`, `runAsSystem`, and refuse when the actor is `null`. Route the two import handlers through `guarded("import", "imports", …)`. | S |
| M3 | Supplier update aliases: `null`/`0` erase stored values; hand-copied map; three "non-empty" rules | **Med** (narrowed) | `crudHelpers.js:63-72` (copied map), `:89` (`String(payload[alias]).trim()`), `:94` (`?? ""`), `:121` (`find(Boolean)`). Probe S1: `{branch:null}` blanked the branch and left the bank text stale. Probe S5: `{account_number:0}` blanked the account number. Probe S3: `{account_name}` is silently ignored on update. `KEEP_OMITTED_ON_UPDATE` is still hand-typed. There is still no `supplierFields.js`. The comment at `:61` is misplaced. | The supplier-erase defect class is still reachable with `null`, which forms and JSON payloads send for a cleared optional field. The bank columns and the bank text can now disagree without the bank-change gate noticing. | (1) Add one `const present = (v) => v !== null && v !== undefined && String(v).trim() !== ""` and use it at `:89`, `:94` and `:121` (`find(present)`). (2) Derive the update map: `const { supplier_name: NAME_FALLBACKS, ...SUPPLIER_UPDATE_ALIASES } = SUPPLIER_FIELD_ALIASES`. Add a test that no alias maps to two columns in the update map. (3) Decide whether `account_name` on update means `supplier_account_name`. If not, refuse it with a guided message instead of dropping it. (4) Move the comment back to `SUPPLIER_BANK_PARTS`. (5) Tests: S1 and S5. (6) As before: a derived keep-omitted set and `domain/supplierFields.js`. | XS-S |
| L1 | Master-data bank check still in `main.js` | Low-Med | Unchanged. | As before. | As before. | S |
| L2 | Guided bank message matches on error text | Low | Unchanged. | As before. | Typed `code`/`reason` on the permission error. | XS |
| L3 | Rollback deny-lists | Low (partly fixed) | `bank_statement_direct_post_blocked` was added (`goLiveService.js:174`), but no test covers it. `READ_ONLY_AUDIT_ACTIONS` is still a hand list, apart from `audit-graph.json` `eventCatalog`. `NOT_BOOK_TABLES` and the `users` asymmetry are unchanged. | Every new refusal or read action needs an edit here. It fails closed. | As before: a `mutates: false` flag in the catalog, with a parity test. Add a test that a `bank_statement_direct_post_blocked` row does not block rollback. | XS-S |
| L4 | History recovery and backup gaps | Low | Unchanged. | As before. | As before. | S |
| L5 | Parser: silent loss on whitespace-closed markup; three readers; renderer copies; new caps inconsistent | Low (partly fixed) | Tag stripping inside cells is now linear (`<[^<>]*>`, `:87`, tested with 160k `<`). Shape caps were added. Remaining: `</td >` and `</tr >` still lose rows, the narrow entity decoding, the second `td\|th` walker, and no tests for HTML upper-case, a non-`sheet1` workbook or shared strings. New: blank headers count toward the CSV/HTML cap but not the XLSX cap (I4). The byte cap and the shape caps are in two places. The renderer fallback parsers have no caps. Only the column cap is tested. | AGENTS.md §12. | As before, plus: filter blank headers before `toRecords` in all formats (or count them in none). Group the four limits in one `IMPORT_LIMITS` object. Add tests for the row cap and the value cap. | XS-S |
| L6 | §4 owner sign-offs and §14 runs not shown | Low | Carried over (a)–(f). New in this commit: (g) supplier update alias semantics changed a third time (save behaviour). (h) An `auditLog` failure now aborts a reset (reversal and reset behaviour). (i) `imports:parse-file` now needs the `import` permission (access behaviour). | AGENTS.md §4, §17. | List (a)–(i) in the PR for the owner's "go". Run and record §14 plus `verify:voucher-inventory`. | XS |
| L7 | Dev runtime root is the checkout; ignore rules added one file at a time | Low (widened) | `main.js:197`. Fixed: `/environment-config.json` (`.gitignore:50`). Still exposed: `config/alerts.json` (`alertService.js:30`, which holds the SMTP and WhatsApp settings and their encrypted secrets) and `database/pending_restore.json` (`operationalResetService.js`, `backup.js`). `git check-ignore` matches neither. `/deployment/` still claims a top-level source name. | The next `git add -A` after setting up alerts in dev commits the alert configuration. The secrets are encrypted with OS storage, but the hosts, user names and recipients are not. This is the third runtime file in three commits. | Preferred, as before: default the dev runtime root to `<checkout>/runtime/` (already ignored), keeping `GII_GEM_ERP_DATA_ROOT` as the override. Minimum: add `/config/` and `database/*.json`. Add a test that runs the integrity suite with the runtime root set to a temp copy of the checkout and asserts `git status --porcelain` is empty. | XS |
| I1 | Lint list still misses the changed files | Info | `lint:syntax` still skips `crudHelpers.js`, `goLiveService.js`, `goLiveHistoryService.js`, `importParserService.js` and `operationalResetService.js`, which are four of the five service files changed here. | Carried over. | Glob-based `node --check` over `src/main/**/*.js`. | XS |
| I2 | `verifyAuditChain` injection is inconsistent | Info | Unchanged. | — | As before. | XS |
| I3 | Third variant of the CSV formula guard | Info | Unchanged. | — | As before. | XS |
| I4 | Small items | Info | Unchanged. `if (mark.auditId)` still needs a comment. | — | As before. | XS |

## Previous findings (audit at 92071b3): status at f833346

| # | Status |
|---|---|
| M1 | **Mostly fixed; now Low.** Done: (1) the audit position and company are stored on the entry; (2) the earliest go-live-module reset of that company after the start is used; (3) the row is written inside the transaction; (4, partly) the status checks now come before the mark checks through a shared function; (5) probe A2 and the status ordering behave correctly, and the fixture uses the real module. Still open: the guard is outside the service, two refusal shapes, a wizard display bug, the literal module name, and a test that does not run the real reset. |
| M2 | **Unchanged.** A third permission-call style was added (`main.js:923`). |
| M3 | **Partly fixed.** Done: one-to-one update aliases (`beneficiary_account_name` no longer renames) and blank or whitespace aliases are kept. New gap: `null` and `0` aliases still erase (S1, S5). Still open: the hand-copied map, the hand-typed keep-omitted set, and no `supplierFields.js`. |
| L1 | **Unchanged.** |
| L2 | **Unchanged.** |
| L3 | **Partly fixed.** The named action was added, with no test. Everything else is unchanged. |
| L4 | **Unchanged.** |
| L5 | **Partly fixed.** Tag stripping is linear and shape caps were added. Silent loss, missing tests and renderer copies remain, and a cap inconsistency is new. |
| L6 | **Still pending**, with three new items (g–i). |
| L7 | **Partly fixed, and my earlier evidence was wrong.** `environment-config.json` was tracked, not untracked, and is now removed and ignored. Two more unignored runtime files were found. The root cause is unchanged. |
| I1 | **Unchanged.** The gap now covers `operationalResetService.js` too. |
| I2–I4 | **Unchanged.** |

`goLiveService.js` grew from 264 to 289 lines, `importParserService.js` is 300, `crudHelpers.js` grew from 594 to 604, and `init.js` is unchanged at 2,122.

## Test coverage of the new paths

Covered:
- The lost mark with a later go-live-module reset is refused.
- The fallback with the real module and company.
- A beneficiary-name alias does not rename the supplier.
- A blank branch alias keeps the stored branch.
- A 20,000-column header is refused quickly.
- 160k `<` characters in an HTML cell.

Not covered:
- The lost mark after a *standalone* reset (G2) and an edit of a master with no new row (G5). Both are correct in the probe but have no test.
- The lost-mark test running the real `executeEnhancedReset`.
- A completed run going through `assertGoLiveRollbackSafe` (G6).
- An audit write failure inside the reset (G8).
- A `bank_statement_direct_post_blocked` row.
- The `null`/`0` aliases (S1, S5) and `account_name` on update (S3).
- The row and value caps.
- Blank-header counting across formats.
- `imports:parse-file` without the `import` permission.
- `git status` clean after a dev run.

## AGENTS.md compliance

| Rule | Result |
|---|---|
| §2 App.jsx protection | Pass (not touched). |
| §3/§6 Modular placement, no silent refactors | Pass with notes. The update map is copied instead of derived (M3), and the module name is repeated (M1). |
| §4 IPC, preload, route keys, schema | Pass. No change. The new fields are in the JSON history only. |
| §4 Preserve core logic | **Needs owner sign-off** (L6 a–i). |
| §9 Company context | **Pass now**: the rollback mark filters on `company_id`. |
| §12 Import safety | Improved (caps), still partial (L5). |
| §13 Guided errors | Pass for the new messages. The wizard shows the wrong field for returned rollback refusals (M1). |
| §14 Verification commands | Not shown as run (L6). |

## Recommended order

1. **M3**: one `present()` rule in all three places, a derived update map, tests S1 and S5.
2. **L7**: ignore `/config/` and `database/*.json` now. Then move the dev runtime root.
3. **M1 residue**: a shared module constant, the real reset in the test, one refusal shape, and the wizard reading `rollbackResult.reason`.
4. **M2**: one actor source, `runAsSystem`, refuse writes with no actor, and the import handlers through `guarded`.
5. **L3/L5**: the catalog flag and tests, blank-header consistency, and tests for the caps.
6. **L6**: the owner sign-off list and the §14 run. Then I1–I4, L1, L2 and L4.

None of these needs a schema change or an IPC, preload or route-key change.
