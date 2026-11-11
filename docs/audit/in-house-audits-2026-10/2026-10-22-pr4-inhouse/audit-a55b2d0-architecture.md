# Architecture and Sustainability Audit: commit a55b2d0

Repo `/home/claude/gii-gem-erp`, branch `claude/erp-full-automation-qbhv8k` (PR #4), HEAD `a55b2d0` ("Close the 219b2d3 audit findings"). Scope: `git diff 219b2d3 a55b2d0`, 14 files, +339/-104. Baseline: `audit-219b2d3-architecture.md` (N1–N4, M1–M3, L1–L7, I1–I4). This was a read-only review. Nothing in the repo was edited, and `git status --porcelain` was empty before and after. Written 2026-11-10.

Scratch probes are in `/tmp/a55-arch/`:
- `p.mjs` covers bank normalisation (P1 invisible-only alias, P3 account-name alias, P4 numbers and refusals on `companies`), the CRAC default writer (P8) and the voucher-proposal double audit, including atomicity (P5).
- `old1.mjs` runs P1 against an exported copy of 219b2d3 (`/tmp/a55-arch/old/`) to tell new behaviour from old.

They run against the real `init.js`, `cracService.js`, `orderClosureService.js` and `bankReconciliationService.js`, on throwaway databases.

Checks run:
- `npm run test:integrity` passed: **93/93 Node tests and 19/19 IPC tests**. At 219b2d3 it was 87 + 19.
- `npm run lint:syntax` passed (exit 0).
- I did **not** run the AGENTS.md §14 set (`build`, `verify:accounting`, `verify:financials`, `verify:voucher-inventory`, `verify:controls`). Those scripts use the dev database. The commit message (`git log -1 a55b2d0`) does not show that anyone ran them, and it does not show any §4 approval (L6).

Claims marked *(inferred)* come from reading the code and were not run. Every other behaviour claim was run in a probe or in the suite.

## Verdict

**Rating: Sustainable with conditions. Better than 219b2d3. No High finding.**
- **N1 (Medium) is closed in its main part.** Normalisation now runs at the start of `cleanPayload`, numbers are handled, and there is one equality rule. Two residues remain at a lower severity: N5 (Low-Med) and N10 (Low).
- **N2 (Low-Med) is closed.** The CRAC and closure audit now sits in the services, inside the write's transaction, with the company. Its residue is N7 (Low).
- **N3 is mostly closed.** The value cap is back to 6M, TSV counts only filled rows, and the test is resized. **N4 is half closed.**
- **M1 is mostly closed.** **M2 is still Medium and has grown.** There are now three ways a handler names its actor.
- **One new Low-Med (N6).** The new audit row for voucher proposals is not atomic in three of its five callers, and it doubles or triples the trail.

What improved:
- **One normalisation step before the bank text is built** (`crudHelpers.js:145` calls `bankDetailsPolicy.normalizeBankFields`, `bankDetailsPolicy.js:57`). The guard only checks now (`init.js:1753`).
  - Whole numbers keep their digits (`bankDetailsPolicy.js:50`). P4: `account_number: 9876543210` on `companies` is stored as `"9876543210"`.
  - Fractions, negative numbers, booleans and objects get a guided refusal. P4b and P4c show the refusal. The new test checks that a refusal leaves the record unchanged (`audit2-regressions.test.mjs:433-437`).
  - S5, S9 and S11 from the last audit are now covered by tests (`audit2-regressions.test.mjs:420-437`).
- **One "same value" rule.** `sameBankValue` (`bankDetailsPolicy.js:35`) is used in `differs` (`crudHelpers.js:91`), in `supplierBankPartsChanged` (`:102-106`) and in `bankDetailChanges` (`bankDetailsPolicy.js:79`). The text builder uses `hasValue` (`crudHelpers.js:125-134`), so `0` is written as `0`, not `-`.
- **CRAC and closure writes are now transactional.** Each write and its audit row run in one `db.transaction` (`cracService.js:75-150`, `orderClosureService.js:37-46`).
  - Each audit row carries `company_id`, and update and delete keep `old_value`.
  - The `main.js` wrappers are gone (`main.js:1364-1374`).
  - A test checks the company on each row and the rollback when the audit write fails (`audit2-regressions.test.mjs:490-505`).
- **One refusal shape for rollback.** `go-live:rollback` returns the guard refusal as `{rollbackResult:{success:false, reason}}` (`main.js:1313-1319`).
  - The wizard shows the outcome's own reason without doubling the prefix (`GoLiveWizard.jsx:172-176`).
  - The pending-restore message is now guided (`rollbackService.js:52`).
  - The legacy branch has a removal date (`goLiveService.js:202`), and the lost-mark comment is updated (`:234-235`).
- **`mark.auditId != null`** (`goLiveService.js:246`) fixes a mark taken at audit position 0. A test covers it (`audit2-regressions.test.mjs:407-418`).
- **`allocation_audit` and `voucher_proposal_audit` now count as book tables** (`goLiveService.js:171-173`). The test is at `audit2-regressions.test.mjs:386-407`.
- **Import parser:**
  - TSV counts filled rows while it reads (`importParserService.js:93-100`). I4 from the last audit is fixed, and a test covers it (`audit2-regressions.test.mjs:459-461`).
  - New caps on header length and total key size (`:47-52`).
  - The shared-string count is capped (`:175-179`).
  - The header search skips long cells (`:317`).
- **The Tally preview** reads each file once, and at most 20 files (`tallyImportService.js:425-442`).
- **`lint:syntax` covers every service file this commit changed** (`package.json:25`).

AGENTS.md compliance:
- `App.jsx` was not touched.
- No IPC channel, preload method, route key or schema was changed. The CRAC and closure functions take an extra optional argument, which is internal and not in the preload.
- The new refusals are guided (§13).
- One gap: a guided message is not used for every new refusal. "row N of the filled rows" (`importParserService.js:322`) does not match the Excel row number (N9).

What remains:
1. **Alias presence is still decided on the raw payload, before normalisation (N5).** On update, an alias holding only an invisible character still erases the stored bank part. This behaviour predates this commit.
2. **Voucher-proposal audit (N6).** The new `audit_log` write runs outside a transaction in update, approve and reject. Its action names are built from strings. Posting now writes three audit rows.
3. **M2.** The actor comes from three places: `withActor`, `actorId()` and the ambient `actorStore`. This commit adds a redundant fourth use (`main.js:879`).
4. **The CRAC services default to a silent no-op audit writer (N7).** That is the same pattern the last audit criticised for `guardSensitiveWrite`.
5. **The rollback handler's catch is too wide (N8).** Any error from the guard, including a database fault, becomes a "refusal". It is not journaled and not audited.
6. **§4 sign-offs and the §14 run are still not shown (L6).** Seven items are new in this commit (p–v).

## Design choices asked about

| Choice | Judgement |
|---|---|
| **`normalizeBankFields` in `cleanPayload`, with an alias list** (`crudHelpers.js:140, 145`; `bankDetailsPolicy.js:47-66`) | **Right layer, and it closes N1's ordering and number issues.** The function returns a new object, so the caller's payload is unchanged (`:59`). Refusing non-integer numbers with a guided message is the safer of the two options offered. Three gaps remain. (a) **The update path decides before it normalises.** `updateRecord` calls `withStoredFields` (`crudHelpers.js:458`) before `cleanPayload` (`:459`). `withStoredFields` uses `hasValue` (`:52`), which relies on `String.trim()` and so treats U+200B and U+FEFF as values. It therefore drops the stored column (`:86`) for an alias that normalisation then turns into `""`. P1: `{branch:"\u200B"}` erased `supplier_branch` and logged `bank_details_changed`. `{ifsc:"\uFEFF"}` erased the IFSC. The same probe at 219b2d3 (`old1.mjs`) also erased it, so this is old, not a regression. It is the last route left in M3's "erase" class (N5). (b) **Who knows which keys are bank keys is now split.** `BANK_FIELDS` and `MASTER_IMPORT_BANK_KEYS` live in the policy (`bankDetailsPolicy.js:11-23`). `SUPPLIER_BANK_PARTS`, `SUPPLIER_FIELD_ALIASES` and the derived `SUPPLIER_BANK_ALIASES` live in `crudHelpers.js` (`:55-70, 140`), and they are passed to the policy as untyped `extraKeys`. The account-name alias (`beneficiary_account_name`) is in neither list. P3: `" Acme Pvt \u200B"` is stored padded and written into `bank_details` (N10). (c) Values already stored as `"12345678.0"` by earlier numeric saves are not repaired. A correct resend of `12345678` differs under `sameBankValue`, so it counts as a bank change and needs the settings permission *(inferred from `bankDetailsPolicy.js:35`)*. **Fix:** normalise once at the top of `createRecord` and `updateRecord`, before `withStoredFields`. Better still, give `hasValue` the policy's `text()`, so that "present" and "same" share one rule. Move the supplier alias map into the policy, or into `domain/supplierFields.js` (an M3 item), so the policy owns its keys. Add a one-off report or repair of `/\.0$/` account numbers, which needs owner approval under §4 because it changes existing records. |
| **Injected audit writers in `cracService` and `orderClosureService`** (`cracService.js:9-23, 75, 101, 132`; `orderClosureService.js:37, 44`; `main.js:1365`) | **The transaction and the company fix N2. Injecting the writer is consistent with the repo's dependency style. The silent default is not.** (a) `audit = noAudit` and `audit = () => {}` mean that any caller that omits the argument writes without an audit row. P8: `createCracRecord(db, {...})` with no writer added **0** audit rows. That is exactly what the last audit criticised in `guardSensitiveWrite = () => []` (`crudHelpers.js:19`). The repo's other services take `auditLog` as a required dependency (`bankReconciliationService.js:6`, `createCrudHelpers({auditLog})`). (b) It is a **third audit-writer signature**: `audit(entry)`, next to `auditLog(db, entry)` and the services' `deps.auditLog`. `main.js:1365` builds the adapter. (c) The `new_value` shape (`{record, supply_order_id}`, `cracService.js:21`) differs from every other audit row, which stores the record itself. An audit report that parses `new_value` would need a special case *(inferred)*. (d) No `user_id` is passed, so the row relies on the ambient actor (M2). (e) The test passes the writer explicitly (`audit2-regressions.test.mjs:493`). Nothing checks that the IPC path passes it. **Fix:** a `createCracService({ auditLog })` factory like the other services, or `if (typeof audit !== "function") throw new Error(...)` with no default. Store the record in `new_value` and put `supply_order_id` in its own field. Add an IPC-level test (in `ipc-security.test.mjs`) that `crac:create` leaves a row. |
| **Voucher-proposal double audit** (`bankReconciliationService.js:387-404`) | **It closes the lost-mark blind spot for proposals, but it is the N2 pattern again in another service.** (a) **Not atomic.** `proposalAudit` is called from five places. Generate (`:558`, transaction at `:573`), create-draft (`:697`, transaction at `:709`) and post (`:730`, transaction at `:744`) run inside `db.transaction`. Update (`:639-678`), approve (`:680-687`) and reject (`:689-695`) do not. P5b: with `audit_log` failing, `rejectVoucherProposal` threw "audit down", yet the proposal was saved as `Rejected` and its `voucher_proposal_audit` row was written. The user sees an error for a saved change. (b) **The action name is built by string munging.** `` `voucher proposal ${action.toLowerCase()}` `` gives `"voucher proposal proposal approved"`, and the test fixes that string (`audit2-regressions.test.mjs:403`). That is a fifth naming style next to snake_case (`voucher_proposal_posted`, `crac_created`) and plain words (`update`). (c) **Volume.** Posting now writes three rows for one event: `voucher_proposal_audit`, `"voucher proposal voucher posted"` and the existing `voucher_proposal_posted` (`:769-770`). Generate writes one `audit_log` row per bank line plus a summary row (`:587, 591`), each through `auditLog`'s hash-chain read (`init.js:1628`). A large statement doubles its write count *(inferred)*. (d) `voucher_proposal_audit` is now both a counted book table (`goLiveService.js:171-173`) and mirrored into `audit_log`. Two mechanisms now detect the same change. That is harmless, but it is one more thing to keep in step. **Fix:** wrap update, approve and reject in `db.transaction`, or make `proposalAudit` throw when it is called outside one (`db.inTransaction`). Map the actions through a fixed table to snake_case (`voucher_proposal_approved`, and so on). Drop the separate `voucher_proposal_posted` row, or skip the mirror for that action. |
| **`go-live:rollback` returns refusals** (`main.js:1311-1323`) | **This closes M1 item 2: one UI path.** Three costs. (a) **The catch takes every error.** A `SQLITE_BUSY`, a `TypeError` in the guard or a corrupt history file now reaches the screen as a "refusal". It is no longer journaled for the Error Console, because `handle` journals only thrown errors (`main.js:761-769`), and no audit row is written. Before, a refusal at least reached the journal. (b) **The mapping is decision logic in `main.js`**, the L1 and N2 pattern again. (c) `failGoLiveWithRollback(runtimeRoot, goLiveId, reason, db, userId)` still has two unused parameters (`goLiveService.js:282`) and is called with `null` (`main.js:1320`), so M1 item 3 is still open. **Fix:** throw a typed refusal from the guard (`error.code = "ROLLBACK_REFUSED"`, which is also L2's fix). Move a `rollbackGoLive(db, root, id, reason, userId)` into `goLiveService` that maps only that code, writes a `go_live_rollback_refused` audit row and rethrows anything else. Drop the unused parameters. |
| **Header search: refuse past row 50** (`importParserService.js:25, 31-32, 315-324`) | **This closes the silent mis-map for a header that sits low. The "no header" case is still silent.** (a) When no row matches (`headerIndex === -1`), the parser still falls back to row 0 with no message (`:324`). That was the case N4 asked to refuse. It is load-bearing for XLSX sheets whose header is not one of the five titles, such as bank statements *(inferred)*. So the honest fix is a per-import-type title list, not a blanket refusal. (b) The search now scans the **whole** matrix (`:318`). `MAX_HEADER_SEARCH_ROWS` has become a refusal threshold, and its name now says the opposite. A sheet with no recognised header but with a data cell such as "Company Name" or "Item Name" after row 50 is now **refused**, where before it was read *(inferred)*. (c) The message says "row N **of the filled rows**" (`:322`). Blank rows are dropped from `matrix` (`:313`), so N is not the Excel row the user will look for (§13 "where it failed"). The `r` attribute is available while reading. (d) `HEADER_TITLES` (`:31`) is a fourth copy of the header vocabulary, next to the refusal text at `:322`, the import screens and `normalizeHeader`. **Fix:** keep the Excel row number with each matrix row and report it. Rename the constant to `MAX_HEADER_ROW`. Let each caller pass its expected titles (`parseImportBuffer(name, buf, { headerTitles })`), and refuse when none is found, with a guided message. |
| **Value cap 6M; header and key caps; shared-string cap** (`importParserService.js:22-32, 47-52, 175-179, 195-201`) | **The cap level is now justified, but the limits are more scattered.** There are now **13** limit constants in two blocks of one file (`:22-32` and `:195-201`), plus `MAX_TALLY_PREVIEW_FILES` in another service (`tallyImportService.js:425`). The shared-string message hard-codes `"2,000,000"` (`:178`) instead of formatting `MAX_XLSX_CELLS`. Elsewhere `en-IN` formatting gives `"2,00,000"` (`:35`), so the two formats are still mixed. A sheet over the key-size cap gets the generic "N rows of M columns" message, which does not name header length as the cause (`:52-53`). Still without a test: the value cap, the per-cell cap (`:300`), the sheet cap (`:304`) and the row cap. **Fix:** N3 items (3) and (4) as before: a frozen `IMPORT_LIMITS` that also feeds the messages, and tests for each cap. |
| **Lint list** (`package.json:25`) | **This closes I1 for the files this commit touched.** The cause is unchanged: the list is typed by hand. **26 of 52** tracked `src/main/**/*.js` files are still not checked (count run on a55b2d0). **Fix:** `node --check` over a glob, as before. |
| **`voucher-proposals:update` adds `user_id: actorId()`** (`main.js:879`) and **`crac:create` adds `created_by: actorId()`** (`main.js:1366`) | **The CRAC one is needed. The proposal one is redundant.** `guarded` already rewrites `user_id` on the first object argument through `withActor` (`main.js:257-265, 300`), because `user_id` is always set (`:261`). For `crac:create`, `created_by` is set only when the screen sent it, so the explicit override is right. This is M2 in practice: each handler picks its actor source by hand. |

## Findings

| # | Finding | Sev | Evidence (file:line) | Why it matters | Fix | Effort |
|---|---|---|---|---|---|---|
| N5 | Alias presence decided on the raw payload, before normalisation; an invisible-only alias erases a bank part | **Low-Med** (residue of N1/M3, pre-existing) | `crudHelpers.js:458` (`withStoredFields`) runs before `:459` (`cleanPayload`, which normalises at `:145`). `:52` `hasValue` uses `String.trim()`, while `bankDetailsPolicy.js:27` `EDGE_SPACE` also strips U+200B–U+200D and U+FEFF. `:86` drops the stored column. P1: `{branch:"\u200B"}` led to `supplier_branch=""`, and `{ifsc:"\uFEFF"}` led to an IFSC of `""`, each logged as `bank_details_changed`. The same result occurs at 219b2d3 (`old1.mjs`). | A bank value is silently erased by an import cell that looks empty. It is gated (settings permission) and audited, so it affects admins and imports. | Normalise before `withStoredFields` (at the top of `createRecord` and `updateRecord`). Or define `hasValue` with the policy's `text()`. Add test P1. | XS |
| N6 | Voucher-proposal audit mirror: not atomic in update, approve and reject; action names built from strings; triple rows on post | **Low-Med** (new) | `bankReconciliationService.js:402-403` (mirror). No transaction at `:639-678`, `:680-687`, `:689-695`. Triple rows at `:769-770`. Test fixing the name at `audit2-regressions.test.mjs:403`. P5b: the audit failed, yet the proposal was saved `Rejected` and the user was shown an error. | The rollback guard and audit report depend on these rows. A failure shows an error for a saved change, and a retried reject or approve writes duplicate review rows. The audit vocabulary drifts. | Wrap the three callers in `db.transaction`, or assert `db.inTransaction` in `proposalAudit`. Use a fixed action map to snake_case. Drop the duplicate posted row. Add an atomicity test like the CRAC one. | XS-S |
| N7 | CRAC and closure audit writer is optional with a silent no-op default; third writer signature; odd `new_value` shape | Low (residue of N2) | `cracService.js:9, 75, 101, 132`. `orderClosureService.js:37`. `main.js:1365` adapter. `cracService.js:21` shape. P8: no writer added 0 audit rows. | A future caller (a script, a batch job or the assistant) writes CRAC records with no audit, and the go-live rollback guard misses them. | Make the writer required (a factory or a throw), store the record itself in `new_value`, and add an IPC-level audit test. | XS |
| N8 | Rollback handler catches every error as a refusal; not journaled or audited; mapping in `main.js` | Low (new) | `main.js:1313-1319`. Journal only on throw: `main.js:761-769`. Unused parameters: `goLiveService.js:282`, called with `null` at `main.js:1320`. | A database fault looks like a business refusal, and the Error Console and audit trail lose the event. | A typed `ROLLBACK_REFUSED` code. `goLiveService.rollbackGoLive(...)` maps only that code, audits the refusal and rethrows the rest. Drop the unused parameters. | XS |
| N9 | Header search residue: "no header" still falls back to row 0; constant misnamed; filled-row number in message; whole-sheet scan can newly refuse | Low (N4 half closed) | `importParserService.js:318` (whole scan). `:321-322` (filled-row index). `:324` (row 0 fallback). `:25` (name). `:31` (fourth title list). | §12 "block unsafe import" for sheets with no header. §13 "where it failed". | Excel row numbers, per-import `headerTitles`, a refusal when none is found, and a rename to `MAX_HEADER_ROW`. | XS-S |
| N10 | Bank key ownership split between policy and crudHelpers; account-name alias not normalised; legacy `".0"` values not repaired | Low (residue of N1) | `bankDetailsPolicy.js:11-23` against `crudHelpers.js:55-70, 140, 145`. P3: `supplier_account_name=" Acme Pvt \u200B"`, padded inside `bank_details`. | The next alias or bank field must be added in two files. The stored bank text can still carry padding. A correct resend of a legacy `".0"` value needs admin approval. | Move the supplier field and alias model into the policy or `domain/supplierFields.js`. Normalise `supplier_account_name` and its alias. Repair or report legacy values, with §4 approval. | S |
| N11 | Tally preview: duplicates removed by `path.resolve`; shape-agnostic test | Info (new) | `tallyImportService.js:434` is case-sensitive, so `C:\X.xml` and `c:\x.xml` both pass on Windows *(inferred)*. The test reads one of three possible result shapes (`audit2-regressions.test.mjs:483`). | The count can be off on Windows, and the test would not catch a change in the result shape. | Lower-case the key on win32. Assert the real field name. | XS |
| M1 | Rollback guard: residual coupling | Low (mostly closed) | Done: one refusal shape (`main.js:1313-1319`), the removal date (`goLiveService.js:202`), the comment (`:234-235`), guided pending-restore text (`rollbackService.js:52`), and the position-0 mark (`:246`). Open: the lost-mark test still writes the reset row by hand, not with `executeEnhancedReset`. The unused parameters are still there (`goLiveService.js:282`). | Drift if the reset row's shape changes. | Run the real reset in the test. Drop the parameters (see N8). | XS |
| M2 | Actor sources multiply; writes with no actor skip the bank gate | **Med** (unchanged, grew) | `main.js:234` `let currentActor`. `:239` `actorId()`. `:257-265` `withActor`. `init.js:1617` ambient `actorStore`. `init.js:1755-1756` `if (changes.length && actor)`. New redundant `user_id: actorId()` at `main.js:879`. `imports:parse-file` and `parse-buffer` still bypass `guarded` (`main.js:922, 929`). The CRAC audit rows rely on the ambient actor (`cracService.js:11-23`). | Each new handler picks one of three sources by hand. A write with no actor (a script or a future job) passes the bank gate. | As before: one `actorId()` read from the ambient store, `runAsSystem`, and a refusal for writes with no actor outside it. Route the import handlers through `guarded`. Remove the redundant override at `:879`. | S |
| M3 | Supplier aliases: residue | Low (unchanged) | Open: `account_name` is silently ignored on update. "The column wins" does not hold for a blank column. There is no alias-uniqueness test, and `KEEP_OMITTED_ON_UPDATE` is hand-typed (`crudHelpers.js:75`). The erase route moved to N5. | As before. | As before, plus N10's move. | XS-S |
| L1 | Master-data bank check still in `main.js` | Low-Med | Unchanged. | As before. | As before. | S |
| L2 | Guided bank message matches on error text | Low | Unchanged (`init.js:1769-1775`). The same pattern is now also needed for rollback refusals (N8). | As before. | Typed `code` on refusals. | XS |
| L3 | Rollback deny-list | Low | Unchanged (`goLiveService.js:176`). No test for `bank_statement_direct_post_blocked`. | Each new read-only action needs an edit. It fails closed. | As before. | XS-S |
| L4 | History recovery and backup gaps | Low | Unchanged. | As before. | As before. | S |
| L5 | Parser: silent loss and copies | Low | Unchanged: `</td >` handling, the second `td\|th` walker, and the renderer fallback parsers. The cap tests are under N9 and the design table above. | §12. | As before. | XS-S |
| L6 | §4 owner sign-offs and §14 runs not shown | Low | Carried over: (a)–(o). New: (p)–(v), listed below. The commit message records neither. | AGENTS.md §4, §17. | List (a)–(v) in the PR for the owner's "go", and record §14 plus `verify:voucher-inventory` and `verify:controls`. | XS |
| L7 | Dev runtime root is the checkout | Low | Unchanged (`main.js:197`). | As before. | As before. | XS |
| I1 | Lint list typed by hand | Info (narrowed) | `package.json:25`. 26 of 52 `src/main` JS files are unchecked. | As before. | Glob. | XS |
| I2–I4 | Small items | Info | Unchanged. | — | As before. | XS |

## Previous findings (audit at 219b2d3): status at a55b2d0

| # | Status |
|---|---|
| N1 | **Closed in its main part.** Done: (1) `normalizeBankFields` at the start of `cleanPayload`, numbers handled, trim removed from the guard; (2) `sameBankValue` everywhere; (3) `hasValue` in the text builder; (4) tests S5, S9, S11 and N3. Residue: N5 (presence decided before normalisation, an old erase route) and N10 (who owns the keys, account name, legacy values). |
| N2 | **Closed.** The audit is in the services, transactional, with the company and `old_value`, and the wrapper is removed. The test asks for the company and the rollback. Residue: N7 (optional writer, shape, no IPC-level test). The extra `supply_orders` row was not added. The order is named inside `new_value` instead, which is acceptable. |
| N3 | **Mostly closed.** Done: (1) 6M cap with the test at 300 × 15,000; (2) TSV counts filled rows. Partly done: (4) tests now cover long headers, the shared-string count, TSV blank lines and a header far down. Not done: (3) one `IMPORT_LIMITS` object and one number format; tests for the value, row, cell and sheet caps. |
| N4 | **Half closed.** A header below row 50 is refused with a guided message. The "no header found" case still falls back to row 0. See N9. |
| M1 | **Mostly closed.** Items 2, 4, 5 and 6 are done. Items 1 (real reset in the test) and 3 (unused parameters) are open. |
| M2 | **Unchanged, slightly worse** (`main.js:879`). |
| M3 | **Unchanged** (Low). |
| L1–L5, L7 | **Unchanged.** |
| L6 | **Still pending**, with seven new items. |
| I1 | **Narrowed.** The changed files are now listed. The hand list remains. |

Sizes:

| File | 219b2d3 | a55b2d0 |
|---|---|---|
| `main.js` | 1,426 | 1,424 |
| `crudHelpers.js` | 602 | 610 |
| `importParserService.js` | 327 | 349 |
| `goLiveService.js` | 291 | 294 |
| `cracService.js` | 142 | 168 |
| `bankDetailsPolicy.js` | 64 | 91 |
| `init.js` | 2,124 | 2,124 |

## Owner sign-off needed under AGENTS.md §4

§4 lists "Save/post/reversal behavior", "Existing workflows" and "Existing records". No accounting formula, posting math, GST, valuation, profitability, schema, IPC, preload or route-key change was made.

Carried over and not shown as approved: **(a)–(o)** from the 92071b3, f833346 and 219b2d3 reports.

New in a55b2d0:
- **(p) Save behaviour, every bank master.** Bank fields on companies, suppliers, employees and banks, and the supplier aliases, now **refuse** fractions, negative numbers, unsafe integers, booleans and objects with a guided message. Whole numbers are stored as digits (`bankDetailsPolicy.js:47-53`). A caller that used to save, for example a script or a Tally or master import that sends numbers, may now be refused *(inferred)*.
- **(q) Existing records.** Values already stored as `"NNN.0"` by earlier numeric saves are not repaired. A correct resend now counts as a bank change and needs the settings permission (N10).
- **(r) Audit and reversal behaviour, bank proposals.** Every proposal write now also writes an `audit_log` row. `allocation_audit` and `voucher_proposal_audit` growth now blocks the go-live rollback (`goLiveService.js:171-173`). Any allocation or proposal action after go-live, including a reject, now blocks rollback.
- **(s) Save behaviour, CRAC and closure.** These writes are now all-or-nothing with their audit row. `created_by` on a CRAC is always the signed-in user, and the value the screen sends is ignored (`main.js:1366`).
- **(t) Existing import workflow.**
  - Header names over 100 characters are refused (`importParserService.js:47-50`).
  - Total key size is capped (`:52`).
  - More than 2,000,000 shared strings are refused (`:175-179`).
  - A recognised header below filled row 50 is refused (`:321-322`).
  - The value cap is back to 6M.
  - TSV blank lines no longer count toward the row cap.
- **(u) Existing Tally workflow.** The master-migration preview silently drops repeated files and refuses more than 20 (`tallyImportService.js:425-442`).
- **(v) Rollback screen and channel.** `go-live:rollback` now *returns* refusals instead of throwing (`main.js:1313-1319`), and the wizard text changed (`GoLiveWizard.jsx:172-176`). The response shape of an existing IPC channel changed, though its name did not. This is UI-facing and not strictly §4, but list it so the owner sees it.

## Test coverage of the new paths

Covered:
- Bank values cleaned before the text is built.
- A ZWSP resend is not a change.
- Numeric account numbers, and refusals that change nothing.
- CRAC audit rows with the company, and rollback when the audit write fails.
- Allocation and proposal growth block rollback, and a proposal row is mirrored.
- A mark at audit position 0.
- Long headers, the shared-string cap, TSV blank lines, and a header far down or near the top.
- Tally duplicate files and the 20-file cap.

Not covered:
- An invisible-only alias on update (P1, N5).
- The account-name alias padding (P3).
- Legacy `".0"` values.
- `crac:create` through IPC leaves an audit row, and a missing writer is caught.
- Proposal update, approve and reject atomicity (P5b).
- A rollback guard error that is not a refusal (N8).
- No header found in XLSX (row 0 fallback).
- The value, row, cell and sheet caps.
- The real `executeEnhancedReset` in the lost-mark test.
- `git status` clean after a dev run.

## Recommended order

1. **N6**: put the three proposal callers in transactions and fix the action vocabulary before the string `"voucher proposal proposal approved"` reaches real audit data.
2. **N5**: normalise before `withStoredFields`, or share one presence rule, and add test P1.
3. **M2**: one actor source, and remove the redundant override at `main.js:879`.
4. **N7 and N8**: a required audit writer, and a typed rollback refusal handled in `goLiveService`.
5. **N9 and N3 residue**: Excel row numbers, per-import header titles, `IMPORT_LIMITS`, and cap tests.
6. **L6**: put (a)–(v) in the PR for the owner and record the §14 run. Then N10, M1's residue, M3, L7, I1, L1–L5.

None of these needs a schema, IPC, preload or route-key change. A repair of legacy `".0"` values would touch existing records and needs §4 approval first.
