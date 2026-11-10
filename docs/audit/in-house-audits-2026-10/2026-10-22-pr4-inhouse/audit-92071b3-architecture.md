# Architecture and Sustainability Audit: commit 92071b3

Repo `/home/claude/gii-gem-erp`, HEAD `92071b3` ("Close the 61dfe2b audit and Copilot findings"). Scope: `git diff 61dfe2b 92071b3`, 6 files, +97/-59. Baseline: `audit-61dfe2b-architecture.md` (M1–M3, L1–L6, I1–I4). This was a read-only review. Nothing in the repo was edited, and the working tree was clean before and after. Scratch probes are in `/tmp/audit92-arch/probe/` (`p.mjs`, `html.mjs`, `wb.mjs`). They run against the real `init.js`, the go-live services and the import parser, on throwaway databases. Written 2026-10-22.

Checks run:
- `npm run test:integrity` passed: **85/85 Node tests and 19/19 IPC tests**. At 61dfe2b it was 84 + 19.
- `npm run lint:syntax` passed (exit 0).
- I did **not** run the AGENTS.md §14 set (`build`, `verify:accounting`, `verify:financials`, `verify:voucher-inventory`). Those scripts use the dev database, and this audit was read-only. The commit does not show that anyone ran them (L6).

Claims marked *(inferred)* come from reading the code and were not run. Every other behaviour claim was run in a probe.

## Verdict

**Rating: Sustainable with conditions. Somewhat better than 61dfe2b. No High finding. Two Medium findings were narrowed but stay open (M1, M3). One Medium is unchanged (M2).**

What improved:
- The rollback guard no longer returns without checking anything when the mark is missing. It now falls back to evidence kept in the database (the reset's audit row). It refuses when no reset is recorded, and refuses when work was entered after the reset. Both cases are tested.
- Legacy five-table marks now also check audited edits.
- Looking at records and `permission_denied` rows no longer block rollback.
- Sending only `supplier_account_name` no longer renames the supplier. A bank part resent unchanged no longer rebuilds the bank text. Both are tested.
- The XLSX workbook and relationship lookups now read tag attributes only. No `RegExp` is built from file text any more, which removes a ReDoS and injection vector. The HTML `.xls` path now uses the same linear walker.
- The generated `deployment/certificate-history.json` is no longer tracked, so a fresh checkout no longer shows fake certificates.

AGENTS.md compliance:
- `App.jsx` was not touched.
- No IPC channel, preload method, route key or schema was changed.
- New refusal messages are guided.

What remains:
1. **The fallback rollback mark is chosen by wall-clock time and by "latest reset of any kind".** It is not tied to this go-live run's own reset. A probe showed data loss: a master entered after the go-live reset, followed by a later standalone reset, gets past the guard (M1).
2. **Two actor mechanisms, and writes with no actor are not checked.** Unchanged (M2).
3. **The alias rule fixes the one reported alias, but the alias map is still many-to-many.** `beneficiary_account_name` still renames the supplier. A blank generic alias (`branch: ""`) still blanks the stored field and rewrites the bank text (M3).

## Design choices asked about

| Choice | Judgement |
|---|---|
| **Rollback mark falls back to the reset audit row (`resetAuditIdFor`)** | **Right direction, wrong key.** It does what M1 asked: the evidence lives in the database, not only in the JSON. But it finds the row with `action = 'operational_reset' AND created_at >= generatedAt ORDER BY id DESC LIMIT 1`. (a) The query does not filter on `module` or `company_id`. The go-live reset writes `module: "go_live_preparation"` (`operationalResetService.js:336`), while a standalone reset writes `"operational_reset"`. (b) `DESC` picks the *latest* reset, when the safe mark is the *earliest* reset after the run started. (c) It compares wall-clock text truncated to the second, not ids. **Probe A2**: lost mark, go-live reset, supplier created (masters survive a reset), then a standalone reset of the same company. The guard **allowed** the rollback while the supplier was still present, so the restore would erase it. With multiple companies, the later reset can belong to another company *(inferred)*. Also: (d) the reset's audit row is written *after* the reset transaction commits (`operationalResetService.js:305`). A crash between the two leaves the books reset with no row, so the guard says "nothing to roll back", which is wrong guidance *(inferred; it fails closed)*. (e) The test fixture writes the row with `module: "go_live"`, which is not the real module, so tightening the filter would break the test instead of exercising the real path. |
| **Hand-kept `READ_ONLY_AUDIT_ACTIONS`** | **Acceptable as a stopgap. The fail-closed default is correct**: an unknown action still blocks rollback. But it is a fourth hand-kept list of action strings, kept apart from the action catalog. It already misses a refusal that the previous report named: `bank_statement_direct_post_blocked` (table `bank_statement_imports`, `bankReconciliationService.js:551`). **Probe B**: that row still blocks rollback, which contradicts the commit message ("refused actions no longer block rollback"). The audit event catalog already exists (`src/renderer/knowledge/audit-graph.json` `eventCatalog`, 97 events, 16 marked `informational`, including this one). "Informational" is not the same as read-only, though: `Proposal Generated` creates rows. So the catalog cannot be used as it is. It needs an explicit flag. |
| **Alias rule in `withStoredFields`** (`aliases.filter(a => !(a in SUPPLIER_FIELD_ALIASES))`) | **It works for the reported case, but it encodes the meaning in the shape of the map.** "Is a key of the map" stands in for "is a supplier column". The real problem is that the map is many-to-many. `beneficiary_account_name` is an alias of both `supplier_name` and `supplier_account_name`, and it is not a key, so it still replaces both. **Probe D**: `{ beneficiary_account_name: "Benef Holder" }` renamed "Prime Industrial Suppliers" to "Benef Holder". `{ account_name: "X" }` happened not to rename, only because the fallback order in `normalizePayloadForTable` finds the stored account name first. The rule still treats an empty alias as a replacement. `{ branch: "" }` blanked `supplier_branch` and rebuilt `bank_details`. With no actor, the bank gate did not stop it (M2). `{ contact: "" }` blanked `supplier_contact`. The `differs()` rule for the bank text is sound, and its test is good. |
| **Parser rewrite onto `forEachElement`** | **Good.** There is one linear walker for sheets, shared strings, workbook, relationships and HTML rows, and there is no dynamic regex. Probes: 200k unclosed `<tr><td>` took 197 ms. A relationship id containing regex metacharacters (`rId(.*)+$`) resolved correctly. A workbook whose first sheet is `sheet2` via the relationship file resolved correctly. Weak points: (a) `parseHtmlTable` hand-rolls a second walker for `td\|th`, instead of a multi-tag `forEachElement`. (b) Close tags with whitespace lose data silently: `</td >` dropped row A, and `</tr >` dropped every row. HTML with omitted end tags (valid HTML) returns `[]`. This is the same as the old regex, so it is not a regression. (c) HTML decoding handles only `&nbsp;`/`&amp;` (`&lt;`, `&#39;` stay literal), while XLSX uses `decodeXml`. (d) Neither the HTML path nor the workbook/relationship path has a test. `sheetZip` packs `sheet1.xml` only. |
| **Untracking `deployment/` and adding it to .gitignore** | **Right outcome, narrow fix.** Packaging is unaffected (`build.files` = `dist`, `src/main`, `src/preload`, `package.json`), and no script reads the file. The root cause is that the dev runtime root *is the checkout* (`main.js:197`, `sourceProjectRoot()`), so each runtime-written path needs its own ignore rule. One is already missing: `environment-config.json` is written to the runtime root and is neither tracked nor ignored (`git check-ignore` returns nothing), so the next `git add -A` commits it. `/deployment/` also reserves a natural top-level name. A future `deployment/` folder for installer scripts would be ignored silently. On `git pull`, developers lose their local (fake) certificate history, which is harmless. |

## Findings

| # | Finding | Sev | Evidence (file:line) | Why it matters | Fix | Effort |
|---|---|---|---|---|---|---|
| M1 | Rollback fallback mark not tied to this run's reset; guard still outside the service and before the status checks | **Med** (narrowed) | `goLiveService.js:185-189` (`resetAuditIdFor`: time-based, `DESC`, no module or company filter). Probe A2: fail-open after a later standalone reset. Probe C: a `completed` run with no mark gets "has no record of a reset" instead of "is completed", because `main.js:1312` calls the guard before `failGoLiveWithRollback` runs its status, latest-run and `resetFailed` checks (`:236-252`). The guard still throws, while the service's refusals return `{ rollbackResult }`. The reset audit row is written outside the reset transaction (`operationalResetService.js:305`). The test fixture uses a fake module name (`audit2-regressions.test.mjs:113`). | Rollback restores a whole-database backup. The one guard against wiping real work can still be fooled by an ordinary second reset. | (1) In `recordGoLiveEntry` (in `executeGoLiveReset`), store `auditIdAtStart = MAX(audit_log.id)` and `companyId`. This entry write must already succeed for the entry to exist, and it needs no schema change. (2) Fallback mark = `MIN(id)` of `operational_reset` rows with `module = 'go_live_preparation' AND company_id = ? AND id > auditIdAtStart`. Prefer `resetResult.auditId` when it is present. Drop the `created_at` comparison. (3) Write the reset audit row inside the reset transaction, or pass `goLiveId` into `executeEnhancedReset` and record it in `new_value`. (4) Move the guard into `failGoLiveWithRollback(db, …)` after the status checks, with one refusal shape (a `planGoLiveRollback`). (5) Tests: probe A2 refused; a completed run gets the status message; the fixture uses the real module, or runs `executeEnhancedReset`. | S |
| M2 | Two actor mechanisms; writes with no actor skip the bank gate | **Med** (unchanged) | No change in this diff. `main.js:234` still has `let currentActor`. `init.js:1753` still has `if (changes.length && actor)`. Probe D re-confirms it: `{ branch: "" }` with no actor rewrote `bank_details` with no permission check. | As before. | As before: `actorId = () => currentActor()?.id ?? null`, `runAsSystem`, and refuse when the actor is `null`. | S |
| M3 | Alias map still many-to-many; empty alias still replaces; keep-omitted set still hand-copied | **Med** (narrowed) | `crudHelpers.js:50-60`, `:79-81`. Probe D: `beneficiary_account_name` renames the supplier; `branch: ""` / `contact: ""` blank stored values. `KEEP_OMITTED_ON_UPDATE` (`:68`) is still typed by hand from `BANK_FIELDS`. Supplier knowledge is still in `crudHelpers` (594 lines) plus `importValidationService` and the renderer copy. | The supplier-rename defect class is still reachable through a sibling alias. Any form or import that sends generic empty keys erases data and changes bank text. | (1) Make the map one-to-one for the update merge, with an explicit `UPDATE_ALIASES = { beneficiary_account_name: "supplier_account_name", account_number: "supplier_account_number", … }`. Name aliases (`*_account_name`, `account_name`) map to the account name only. Keep the many-to-one fallback for `create` only. (2) Replace only when the alias value is non-empty after `trim()`. (3) Derive the keep-omitted set from an exported `BANK_TABLES`, with a set-equality test. (4) Extract `domain/supplierFields.js` (aliases, bank parts, `composeSupplierBankText`) with a renderer parity test. (5) Tests: probe D's four payloads. | S |
| L1 | Master-data bank check still in `main.js` | Low-Med | Unchanged. | As before. | As before. | S |
| L2 | Guided bank message matches on error text | Low | Unchanged. | As before. | Typed `code`/`reason` on the permission error. | XS |
| L3 | Rollback deny-lists: `NOT_BOOK_TABLES` and the new `READ_ONLY_AUDIT_ACTIONS` | Low (partly fixed) | `goLiveService.js:167`, `:170`. Probe B: `bank_statement_direct_post_blocked` still blocks rollback. `users` is still excluded only from the audit branch, not from `MAX(id)`. The `NOT LIKE 'ui:%'` exclusion is good. | Each new log table or read/refusal action needs an edit in a file its author will not open. It fails closed, so the cost is support calls on go-live day, not data loss. | Add `"mutates": false` to the read/refusal entries of `audit-graph.json` `eventCatalog`. Generate (or test-check) the main-process list from it, as a constant in `src/main/domain/`, not as a renderer import. Add a test that every listed action exists in the catalog and that the catalog has no `mutates: false` action missing from the list. Add `bank_statement_direct_post_blocked` now. Classify log tables where they are defined. Treat `users` the same way in both branches. | XS-S |
| L4 | History recovery and backup gaps | Low | Unchanged (no `.bak` fallback, rename on read, unguided `rename` failure, `runtime/deployment` not in backups). | As before. | As before. | S |
| L5 | Parser: silent loss on damaged or whitespace-closed markup; three readers; no tests for HTML or workbook/relationship lookup | Low (partly fixed) | Dynamic regex removed and HTML walker linear (`importParserService.js:57-76`, `:207-219`). Remaining: `html.mjs` shows `</td >` drops a row, `</tr >` drops every row, and omitted end tags return `[]`. The second hand-rolled walker for `td\|th`. Narrow entity decoding. No `localHeaderOffset` bounds check and no ZIP64 support. Renderer copies remain. | AGENTS.md §12: a damaged file should be refused with guidance, not partly imported. | Let `forEachElement` take a tag list and accept `</tag\s*>`. Throw a guided "damaged near row N" error when the walker would `return`/`break` early. Use `decodeXml` (plus numeric entities) for HTML. Add tests for HTML upper-case/`th`, for a workbook whose first sheet is `sheet2` (as in `wb.mjs`), and for shared strings. | XS-S |
| L6 | §4 owner sign-offs and §14 runs not shown | Low | Carried over (a)–(d) plus N10. New in this commit: (e) supplier update alias semantics changed again (save behaviour); (f) rollback is now refused when no reset row is found (reversal behaviour). | AGENTS.md §4, §17. | List (a)–(f) in the PR for the owner's "go". Run and record §14 plus `verify:voucher-inventory`. | XS |
| L7 | Dev runtime root is the checkout; ignore rules are added one at a time | Low (new) | `main.js:197`; `.gitignore:10-11`. `environment-config.json` is neither tracked nor ignored. `/deployment/` claims a top-level source name. | The next runtime file written in dev gets committed by accident, as the certificate history was. A future `deployment/` source folder would be ignored silently. | Preferred: default the dev runtime root to `<checkout>/runtime/` (already ignored), keeping `GII_GEM_ERP_DATA_ROOT` as the override, and note the move for developers. Minimum: replace `/deployment/` with `/deployment/*.json` and add `/environment-config.json`. Add a check that `git status --porcelain` is empty after the integrity tests and a dev start. | XS |
| I1 | Lint list still misses the changed files | Info | `lint:syntax` still skips `crudHelpers.js`, `goLiveService.js`, `goLiveHistoryService.js`, `importParserService.js`. | Carried over. | Glob-based `node --check` over `src/main/**/*.js`. | XS |
| I2 | `verifyAuditChain` injection is inconsistent | Info | Unchanged. | — | As before. | XS |
| I3 | Third variant of the CSV formula guard | Info | Unchanged. | — | As before. | XS |
| I4 | Small items | Info | Unchanged. (Also, `if (mark.auditId)` replaced `!== null`, so a legacy mark whose reset row is missing now silently skips the audit check. This is acceptable, but add a comment.) | — | As before. | XS |

## Previous findings (audit at 61dfe2b): status at 92071b3

| # | Status |
|---|---|
| M1 | **Partly fixed.** A missing mark no longer means "no check": the reset audit row is the fallback, "no reset" is refused, and the case "lost update plus later work" is tested and refused. The test that locked in the fail-open path was corrected. Still open: the time-based, latest-first, unfiltered row choice (probe A2 fail-open), the audit row written outside the transaction, the guard called only from IPC and before the status checks, two refusal shapes, and the fake-module fixture. |
| M2 | **Unchanged.** |
| M3 | **Partly fixed.** The `supplier_account_name` rename (P1) is fixed and tested. A bank part resent unchanged keeps the text. Still open: `beneficiary_account_name` rename, empty-alias replacement, the hand-copied keep-omitted set, no `supplierFields.js`, and no PATCH decision. |
| L1 | **Unchanged.** |
| L2 | **Unchanged.** |
| L3 | **Partly fixed.** Read actions, `ui:*` and `permission_denied` are excluded. `bank_statement_direct_post_blocked` (the example named in L3) still blocks. The table deny-list and the `users` asymmetry are unchanged. |
| L4 | **Unchanged.** |
| L5 | **Partly fixed.** Attribute-only lookups, no dynamic regex, linear HTML path. Silent loss, bounds/ZIP64, renderer copies and missing tests remain. |
| L6 | **Still pending**, with two new items (e, f). |
| I1–I4 | **Unchanged.** |

`init.js` is still 2,122 lines. `crudHelpers.js` grew from 590 to 594 lines.

## Test coverage of the new paths

Covered:
- Read and refusal audit rows do not block rollback.
- A lost mark with no reset row is refused.
- A lost mark with a reset row and no work is allowed.
- A lost mark with a reset row and later work is refused.
- A partial supplier update sending only `supplier_account_name`.

Not covered:
- A later reset after the go-live reset (probe A2).
- Status-message ordering (probe C).
- `bank_statement_direct_post_blocked` (probe B).
- `beneficiary_account_name` and empty aliases (probe D).
- The HTML `.xls` path.
- The workbook/relationship lookup with a non-`sheet1` target.
- Shared strings.
- `git status` clean after a dev run (L7).
- All 61dfe2b "not covered" items under M2, L1, L4 and L6.

## AGENTS.md compliance

| Rule | Result |
|---|---|
| §2 App.jsx protection | Pass (not touched). |
| §3/§6 Modular placement, no silent refactors | Pass with notes. Policy lists are still kept far from their sources (L3), and supplier knowledge is still inside `crudHelpers` (M3). |
| §4 IPC, preload, route keys, schema | Pass. No change. |
| §4 Preserve core logic (save/reversal behaviour) | **Needs owner sign-off** (L6 a–f). |
| §9 Company context | **Gap**: the rollback fallback ignores `company_id` (M1). |
| §12 Import safety | Partial (L5). |
| §13 Guided errors | Pass, with the probe C misdirection (M1) and the crash-window message (M1d). |
| §14 Verification commands | Not shown as run (L6). |

## Recommended order

1. **M1**: record `auditIdAtStart` and `companyId` on the entry, choose the first matching `go_live_preparation` reset by id, write the reset row inside the transaction, and move the guard into the service after the status checks. Add probe A2 as a test.
2. **M3**: one-to-one update aliases, non-empty-only replacement, derived keep-omitted set. Add probe D as tests.
3. **M2**: one actor source, `runAsSystem`, and refuse writes with no actor.
4. **L3**: an action catalog flag for `mutates: false`, plus the missing blocked action. **L7**: dev runtime root or ignore rules.
5. **L5**: multi-tag walker, guided damaged-file error, and tests. Then L1, L2, L4.
6. **L6**: owner sign-off list and the §14 run. Then the Info items.

None of these needs a schema change or an IPC, preload or route-key change.
