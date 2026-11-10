# Architecture and Sustainability Audit: commit 3c12e50

Repo `/home/claude/gii-gem-erp`, branch `claude/erp-full-automation-qbhv8k` (PR #4), HEAD `3c12e50` ("Preserve the a97daf4 audits and update the audit manifest"). Scope: `git diff a97daf4..3c12e50`, 8 commits, 64 files, +8,154/-150. Most of the added lines are the preserved audit reports. The code part is 26 files: `main.js`, `init.js`, `crudHelpers.js`, `authService.js`, `bankReconciliationService.js`, `goLiveService.js`, `entitySearchService.js`, `importParserService.js`, `orderClosureService.js`, `tallyImportService.js`, the new `profitSimulatorService.js`, preload, `client.js`, `App.jsx`, `ProfitSimulatorScreen.jsx`, two closure components, two verify scripts and two test files.

Commits: `ad22c60` (audit preservation), `5e18323` (GGR-1 note), `0dd9a61` (SEC-1), `a7a31b1` (Profit Simulator), `c68d74b` (a97daf4 architecture findings), `4acb571` (company and order boundaries, closure), `ce1d30b` (a97daf4 correctness and security findings), `3c12e50` (manifest).

Baseline: `audit-a97daf4-architecture.md` (N6–N19, M1–M3, L1–L7, I1–I4). This was a read-only review. Nothing in the repo was edited, and `git status --porcelain` was empty before and after. Written 2026-11-10.

Checks run:
- Node suites (`critical-defects`, `posting-regressions`, `alerts`, `audit1-regressions`, `audit2-regressions`): **104/104 passed**. At a97daf4 it was 98.
- `ipc-security.test.mjs` under the Electron register: **22/22 passed** (19 before, plus 3 SEC-1 tests). It ran in this container.
- `npm run lint:syntax`: exit 0.
- Graph and governance scripts, all exit 0: `verify:knowledge`, `verify:workflow-graph`, `verify:database-graph`, `verify:voucher-accounting-graph`, `verify:erp-brain`, `verify:help-assistant-brain`, `verify:feature-function-graph`, `verify:audit`, `verify:graph-registry` (52 PASS, 1 INFO: 312 of 316 git-ignored archive reports absent), `verify:audit-graph`, `verify:manual-graph`.
- The in-house audit manifest was recomputed independently (Python, SHA-256 and size for all 38 entries). All match. The three a97daf4 reports in the archive are byte-identical to the originals in this folder.
- I did **not** run the AGENTS.md §14 set (`build`, `verify:accounting`, `verify:financials`, `verify:controls`, `verify:voucher-inventory`). They use the dev database. No commit message in the range records a §14 run or a §4 approval (L6).

Claims marked *(inferred)* come from reading the code and were not run.

## Verdict

**Rating: Sustainable with conditions. A little better than a97daf4. No High finding. One Medium.**

What improved:
- **M2 is mostly closed.** `main.js` no longer keeps its own `currentActor` global. `actorId()` reads the ambient actor (`main.js:242-244`), which `handle()` sets for every signed-in call (`main.js:785`). `imports:parse-file`, `imports:parse-buffer`, `bank:preview-import`, `certificate:generate` and `feedback:export` are now guarded (`:887`, `:937-943`, `:1344`, `:1397`). Since every non-public channel now runs under an actor, the "no actor skips the bank gate" path (`init.js:1755-1756`) is reached only from public channels and startup.
- **N13 is closed.** The XLSX cell cap is back to 2,000,000 (`importParserService.js:280`).
- **N16 is closed.** A single Tally file over the cap gets its own message with Tally steps (`tallyImportService.js:462-467`). The stock preview has the same cap (`:430-433`).
- **N8 is mostly closed.** A refusal carries `code = ROLLBACK_REFUSED` (`goLiveService.js:212-218`), and the handler checks the code, not the text (`main.js:1330`).
- **N9's one-column case is closed.** A late header in a one-column sheet is refused again (`importParserService.js:412-414`), and the test now asserts the refusal.
- **N12's `"1.0"` defect is closed.** Booleans are stored as `"1"`/`"0"` (`crudHelpers.js:146`), and the test asserts the stored value.
- **The Profit Simulator calculation left the screen.** It now lives in `profitSimulatorService.js`, behind a new `profitability:simulate` channel. No channel, preload method or route key was renamed.
- **The Tally scanner** (`tallyTagBlocks`, `tallyImportService.js:45-61`) replaces five lazy regexes with one linear walker. The test shows 60,000 unclosed tags read in under 2 s.

What needs attention:
- **SEC-1 audits grants in only one of its three guard wrappers (S1, Medium).** `AUDITED_GRANTS` lists `account_mapping` and `settings`, but every `account_mapping` channel and the `settings` user-admin channels go through `sessionGuarded`, which never writes the row. `financial_year_reopen` is used by no channel. The commit message says these grants are recorded.
- **The simulator reruns the full profitability report on every keystroke (P1).**
- **Order closure has two definitions of "outstanding" (C1).** The service's default is not the one production injects.
- Import-limit sprawl grew again (N17), and the archive leaves two report files unprotected (A1).

AGENTS.md compliance:
- **App.jsx**: one import and one route line (`App.jsx:57`, `:1335`). That is route orchestration, which §2 allows. No business logic was added.
- **Screens** (§7): `ProfitSimulatorScreen.jsx` no longer sums or applies scenarios. It still works out the change and percentage change for display (`:188-189`). That is presentation, so it is fine.
- **IPC, preload, route keys** (§4): one channel and one preload method were added (`profitability:simulate`, `simulateProfit`). Nothing was renamed. The closure check keys `invoice_submitted` and `payment_received` were kept, and only their labels changed (C2).
- **Error guidance** (§13): the new refusals say what failed, where, and what to do. The closure refusal lists every open item (`orderClosureService.js:55-56`). Exceptions are N9 (row numbers count filled rows only) and P2 (browser preview).
- **§4**: none of the new behaviour changes accounting formulas, posting math, GST or valuation. The closure gate and the simulator clamps are "existing workflow" and what-if math changes. They need the owner's OK, listed as (dd)–(mm) below.

## Design choices asked about

| Choice | Judgement |
|---|---|
| **SEC-1: one ambient actor** (`main.js:242-244`, `:785`; `init.js:1604-1614`) | **Right design, mostly delivered.** The AsyncLocalStorage store is now the only *store* of the actor. It survives `await` (`documents:view`, `documents:download` and `updates:install` are async). `guarded` re-enters `runAsActor` with the full user row (`:312`), which matches the session. **Other ways a handler still gets the user:** (a) `sessionGuarded` passes a trailing `{ user_id, user_role }` argument (`:332-335`). `adminResetPassword` (`:822`), `assignAccountGroup` (`:883`) and `createMappedLedgerAccount` (`:1114`) read the actor from that argument, not from the store. (b) Seven handlers call `sessionUser(event)` directly (`:808`, `:814`, `:1027`, `:1037`, `:1054`, `:1205`, `:1393`). (c) `withActor` stamps payload fields in `guarded` only. `sessionGuarded` does not stamp, so a screen-sent `user_id` reaches the account-mapping services unchanged *(inferred; they use `actor.user_id`, `accountMappingService.js:242`)*. All three come from the same session, so the actor cannot be forged. The design is still not "one source" as the comment at `:239-241` says. (d) `sessionRequired` (`:339-350`) is no longer used. (e) The redundant `user_id: actorId()` override that M2 asked to remove is still there (now `main.js:894`). **Fix:** fold `sessionGuarded` into `guarded`, with an option to pass the actor as a trailing argument where a service needs it. Delete `sessionRequired`, and drop the `:894` override. |
| **Audited grants** (`main.js:308-311`, `:317`) | **Good idea, half wired (S1).** The `permission_granted` row is written only inside `guarded`. (a) `account_mapping` is in the set, but all six account-mapping channels use `sessionGuarded` (`:858-885`, `:1113`), so no grant row is ever written for it. (b) `settings` is recorded for alerts, credit terms and financial-year create, but not for `auth:admin-reset-password` or `auth:list-users` (`:821`, `:828`, both `sessionGuarded`), nor for `updates:install` (`:1205`, a direct `enforcePermission`). Resetting another user's password is about as high-impact as `settings` gets. (c) `financial_year_reopen` is in the set but no channel asks for it. `financial-years:status` reopens under `financial_year_close` (`:933`). (d) Reads are recorded too: every open of the alerts screen (`alerts:get-settings` `:1169`, `alerts:preview` `:1171`) writes a row. That is noise in the hash-chained trail. (e) The row is written before the handler runs, and outside its transaction. A failed action still leaves a "granted" row, and `backup:restore` writes its grant row into the database it is about to replace, so that row is lost. The handler's own `backup_restored` row survives (`:1127`). (f) Only one grant is tested (`environment:set-profile`, `ipc-security.test.mjs`), so (a)–(c) went unnoticed. **Fix:** one wrapper (above), so the grant row cannot be bypassed. Use the set for write channels only, or add a `read` flag. Remove `financial_year_reopen` or wire it to the reopen path. Add an IPC test per entry in `AUDITED_GRANTS` that asserts a row appears. |
| **`accounting:data` audit-trail filter** (`main.js:850-855`) | **Right outcome, wrong layer.** It is a policy rule in `main.js` (like L1), and it uses `roleCan` (role only), which is a third way to check a permission, after `enforcePermission` and `requirePermission`. A role without `view_reports` gets `auditLog: []` with no hint why. **Fix:** move it into `accountingData` (or a report-permission helper), and let the screen say "the audit trail needs report access". |
| **Profit Simulator move** (`profitSimulatorService.js`; `main.js:849`; `preload.cjs:22`; `client.js:108`; `App.jsx:1335`) | **The layering is now right. The call pattern is not.** (a) **Wiring follows conventions.** The channel is `noun:verb`, and the preload name is a verb next to `getProfitability`. It is ungated like `profitability:list`, and it is in `desktopOnlyActions`, not `blockedPreviewActions`. That is the right list for a read-only call. (b) **Every input change reruns the full report (P1).** The screen's effect depends on `params` (`ProfitSimulatorScreen.jsx:39-45`). Each keystroke in one of five number fields sends an IPC call. `orderProfitability` runs `calculateProfitability` once per order (`billingService.js:267`), on the main thread, and then all rows are sent back again. Before, the report was read once per company change. **Fix:** fetch `{ rows, baseline }` once per company, and send only `baseline` and `params` to a light `profitability:simulate` (or debounce by 300 ms). Do not send the rows again. (c) **Browser preview regressed (P2).** The preview used to work from `browserFallbackApi.getProfitability` (`browserFallbackApi.js:548`). Now every change shows the "requires the Windows desktop app" toast, and the page says "No profitability data", which is not the reason. **Fix:** a preview implementation in `browserFallbackApi`, or a guided empty state when `api.__readOnlyPreview`. (d) **The input limits are in two places (P3).** The service clamps billing, cost and expense to −100..1000 (`:49-51`), while the inputs say `max={100}` (`ProfitSimulatorScreen.jsx:158`). Incentive and GST were clamped below at 0 too, where before a negative was accepted. Those are what-if formula changes (rule 4 "profitability formulas"), even though nothing is saved: (ee). (e) **Residue in the screen.** `baselineTotals.inventoryCostBasis || …` (`:180`) can never be true, because the service folds that field into `purchaseValue`. The fallback object literals (`:52`, `:54`) repeat the service's shape. (f) `App.jsx` now renders the route, but `config/screenRegistry.jsx:73` still holds a copy that nothing renders. `verify-entity-picker-integration.js:200-202` checks that unused file. |
| **Closure `outstandingFor` injection** (`orderClosureService.js:6-8, 16, 24`; `main.js:1386-1388`; `init.js:1443`) | **Proving settlement from the books is right. The injection gives two answers for one question (C1).** (a) The default `storedOutstanding` reads `COALESCE(balance_outstanding, invoice_amount, 0)`. Production injects `receivableOutstandingBeforeAdjustment`, which is `invoice_amount − allocations − advance adjustments`. Any caller that forgets the option (a script, a future report, `getClosurePendingOrders` if it ever computes) gets a different settled/unsettled answer *(inferred)*. The tests use the real function or a `() => 0` stub, never the default. (b) A posted invoice with no live receivable row counts as settled under both functions (`return 0`, `init.js:1445`). (c) The name says "before adjustment", but it is used as the settlement answer. It is now exported from the 2,124-line `init.js`, which grows that module's public surface. (d) `markOrderOperationallyClosed(db, id, audit = throwingDefault, closureOptions = {})` now has two optional positional parameters. N7 asked for fewer. **Fix:** make `outstandingFor` required (throw a guided error at the call, as `audit` does), or move the outstanding calculation into a small `receivablesService` that both `init.js` and closure import. Then call `createOrderClosureService({ auditLog, outstandingFor })` once. |
| **Does closure change profitability or posting?** | **No, not under those two §4 headings.** Closure writes `operationally_closed`, `closure_percentage` and `closure_checklist` (`orderClosureService.js:58`). It writes no voucher, ledger or receivable. `orderProfitability` does not read `operationally_closed`. Only the dashboard pending counts do (`dashboardService.js:75-101`). **It is an "existing workflow" change under §4 (dd).** An order that one receipt used to make closable now needs every posted invoice settled, and no saved-but-unposted invoice or receipt. Fewer orders will close, so the dashboard's pending-supply and pending-billing counts will stay higher. The owner should approve that. **Labels against keys (C2).** The labels became "Invoice Posted" and "Payment Settled", but the keys are still `invoice_submitted` and `payment_received`. Orders closed before this commit keep the old labels in `closure_checklist` JSON, so a closure report will show both wordings. No graph, manual or knowledge file refers to the old labels. The Quick-Start manual's "Invoice Posted" (`GII-GeM-ERP-Quick-Start-Guide.md:160`) is a different diagram. |
| **`tallyTagBlocks`** (`tallyImportService.js:41-61`) | **A clean, linear replacement. It is now one of two XML element walkers.** (a) Its behaviour matches the old regexes: case-insensitive, attributes kept, first close wins, `<TAG.LIST` also matches `<TAG` (as `\b` did). A self-closing `<PARENT/>` still captures up to the next `</PARENT>`, exactly as the old regex did, so this is not a regression. (b) `importParserService.forEachElement` (`:194-217`) does the same job with different rules. It handles `<x/>`, is case-sensitive, and stops on a missing close. Two walkers will drift. (c) Two `RegExp` objects are built on every `tallyTagValue` call (`:46-47`). A large masters file calls it about 20 times per block *(inferred cost)*. **Fix:** move one walker into `src/main/utils/xmlScan.js` with a `{ caseInsensitive, selfClosing }` option, and cache the tag regexes by name. |
| **Import limits** (`importParserService.js:20-35`, `:276-284`; `tallyImportService.js:438-439`) | **Each new cap is reasonable. The set grew again (N17).** (a) There are 18 named constants now (16 before). `MAX_ROW_CELLS = 16384` (`:32`) and `MAX_XLSX_COLUMN_INDEX = 16383` (`:279`) are the same Excel XFD limit, written twice. `MAX_IMPORT_COLUMNS = 500` (`:20`) is a third column limit. (b) The bare factors are now `* 6` twice (`:250`, `:385`) and `* 2` twice (`:24`, `:254`). (c) Numbers are typed into messages: "2,000,000" (`:236`, `:377`), "32 million" (`:255`), "16 million" (`:261`), "67 million" (`:390`) and "32,767" four times. The rounding is uneven: 16 MiB is called "16 million", 32 MiB "32 million", but 64 MiB "67 million". (d) Formats are still mixed: `en-IN` "4,00,000" next to western "2,000,000". (e) The Tally cap (50 MB) is no longer tied to `MAX_IMPORT_BYTES` (25 MB). That split is fine, since Tally runs its own preview, but the 50 MB message is written out in full twice (`tallyImportService.js:432`, `:466`). (f) `rowTooWide(rows.length + 1)` (`:100`, `:136`, `:171`) reports the filled-row count, not the file line. That is N9's numbering problem in three more places. (g) The TSV pre-count still counts filled lines (`:127-131`), so 150,000 filled rows plus 260,000 blank lines is still refused (N14). The message is now honest. **Fix:** as before, one frozen `IMPORT_LIMITS` (including Tally) with the messages formatted from it in one locale, one `EXCEL_MAX_COLUMNS`, and the file line number kept while reading. |
| **Governance manifest check and archive** (`verify-governance-graph-registry.js:299-345`; `docs/audit/in-house-audits-2026-10/`) | **The manifest is correct and the check works. Three gaps.** (a) **Regeneration is correct.** 38 entries, count 38, sorted, and every size and hash matches (recomputed). The diff from `ad22c60` only adds three entries and changes the count. No earlier entry changed, so no preserved report was edited. The three a97daf4 copies match this folder's originals byte for byte. (b) The check runs under both `verify:graph-registry` and `verify:audit` (`verify-audit.js:27` imports it), so the README's "`npm run verify:audit` checks" is true. (c) **Two report files are not protected (A1).** `acf6d02-verification/README.md` (141 lines) and `full-audit-acf6d02-2026-10-14/README.md` (135 lines) are audit reports, but the manifest skips them, so they can be edited without a failure. The first one cites `run-full.txt`, which was not archived. (d) The check finds missing or changed files, but not new files left out of the manifest. Someone who adds a report and forgets to regenerate gets a pass. (e) The GGR-1 change accepts an absent archive unless `GII_REQUIRE_REPORT_ARCHIVE=1`, and stops hashing `FORMALLY_EXCLUDED` output. That is reasonable for fresh clones, but CI can no longer catch tampering with the local archive. Record that in the GGR-1 note. **Fix:** list the two READMEs (or every `*.md` except the folder README), add "every `.md` under the folder is listed", and add `run-full.txt` or a note that it was not kept. |
| **Graph and knowledge files** | **Nothing that a verify script requires was missed. Some descriptive data is stale (G1).** No graph lists IPC channels one by one. `renderer-graph.json` records only `ipcRenderer.invoke` (`:6210-6214`). Its ProfitSimulator node still says 279 lines (`:1594`; now 252) and has no link to the new service. It was generated 2026-08-14. `workflow-graph.json`'s ORDER_CLOSURE gaps ("final lock not enforced") are still true. The RECEIPT→ORDER_CLOSURE rule "All receipts must be allocated…" (`:535`) is now partly enforced at run time and could say so. `docs/GII-GeM-ERP-Developer-Module-Reference.md` lists a `getProfitabilityData` that does not exist and does not list `simulateProfit`. It was already stale. |

## Findings

| # | Finding | Sev | Evidence (file:line) | Why it matters | Fix | Effort |
|---|---|---|---|---|---|---|
| S1 | SEC-1 grant audit is written only by `guarded`. `account_mapping` grants are never written, `settings` is skipped on admin password reset, user list and installer launch, and `financial_year_reopen` is unused. Untested. | **Med** (new) | `main.js:308-311, 317`; `sessionGuarded` at `:319-337` used by `:821, :828, :858-885, :1113`; direct check at `:1205`; reopen via `financial_year_close` at `:933`. One grant test (`ipc-security.test.mjs`, "an allowed high-impact action"). | The commit claims a control that is not there for 9 channels. Two guard wrappers with different side effects mean the next high-impact channel can skip it without anyone noticing. | One guard wrapper. Grants for writes only. Fix the reopen permission. One IPC test per `AUDITED_GRANTS` entry. | S |
| P1 | Profit Simulator reruns `orderProfitability` (N+1 per order) and sends back all rows on every input change | **Low-Med** (new, inferred cost) | `ProfitSimulatorScreen.jsx:39-45`; `main.js:849`; `billingService.js:267` | Typing "15" is two full report runs on the main thread. On a large book this blocks every window. | Load rows and baseline once per company. Simulate from the baseline only, or debounce. | XS-S |
| C1 | Closure `outstandingFor` has a default that disagrees with production. Missing receivable counts as settled. Helper exported from `init.js` under a misleading name. Fourth positional parameter. | **Low-Med** (new) | `orderClosureService.js:6-8, 16, 51`; `main.js:1386`; `init.js:1443-1445` | Two definitions of "settled". A caller that forgets the option closes, or refuses, the wrong orders. | Require the dependency (factory `createOrderClosureService({ auditLog, outstandingFor })`), or move outstanding into a receivables module. Test the missing-receivable case. | S |
| P2 | Browser preview: the simulator now fails on load and on every change, with a misleading empty state | Low (new) | `client.js:108`; `browserFallbackApi.js:548` (only `getProfitability`); `ProfitSimulatorScreen.jsx:139-140` | A preview regression: it worked before, and the message ("No profitability data") does not match the cause (§13). | Preview implementation, or a guided "desktop only" empty state. | XS |
| P3 | Simulator clamps changed the what-if math, and the UI limits disagree with the service | Low (new, §4) | `profitSimulatorService.js:48-53` against `ProfitSimulatorScreen.jsx:158` | Rule 4 "profitability formulas". A user can type 500 into a box marked max 100. | Owner OK (ee). One range table shared by the service and the inputs (return it from the service). | XS |
| C2 | Closure labels changed but keys did not, and stored checklists keep the old labels | Low (new) | `orderClosureService.js:32-33`; stored at `:58` | Closure reports mix "Invoice Submitted" and "Invoice Posted" for the same key. | Map labels from keys at display time, not from stored JSON. | XS |
| A1 | Archive: two report files outside the manifest, a dangling `run-full.txt` reference, unlisted files not detected | Low (new) | `docs/audit/in-house-audits-2026-10/acf6d02-verification/README.md`, `full-audit-acf6d02-2026-10-14/README.md`; check at `verify-governance-graph-registry.js:334-345` | The README promise ("never edited") does not hold for those two files, and a forgotten regeneration passes. | List them, and fail on unlisted `.md` files. | XS |
| N17 | Import-limit sprawl: 18 constants, the Excel column limit written twice, 4 bare factors, numbers typed into 9 messages with uneven rounding, mixed locale, Tally message duplicated | Low (grew) | `importParserService.js:20-35, 276-284, 236, 250, 254, 255, 261, 377, 385, 390`; `tallyImportService.js:432, 466` | Every limit change is a multi-site edit with message drift. | `IMPORT_LIMITS` covering Tally, with the messages built from it. | S |
| N14 | TSV pre-count still counts filled lines. The message is now honest. | Low (narrowed) | `importParserService.js:127-131` | A file accepted at a55b2d0 (150k filled + 260k blank) is still refused. | Count blank lines only. | XS |
| N9 | Row numbers count filled rows (now also in `rowTooWide`). No-header fallback remains. | Low (narrowed) | `importParserService.js:100, 136, 171`; fallback near `:418-420` | §13 "where it failed". | Keep the file line while reading. | S |
| N12 | Booleans still accepted into every text column, including required ones (`"1"`). `Date` message unchanged. | Low (narrowed) | `crudHelpers.js:143-152` | A form bug saves `"1"` as a supplier name. | Convert per declared column type, and refuse for TEXT. | XS-S |
| N7 | Closure writer still an optional positional parameter, now followed by a second optional one | Low (grew slightly) | `orderClosureService.js:51` | See C1. | Factory with dependencies. | XS |
| N8 | Typed code in the guard. Other "Rollback refused:" producers untyped, two audit actions, no IPC test of the refusal row or the rethrow. | Low (mostly closed) | `rollbackService.js:44-52`, `operationalResetService.js:356-359`; `main.js:1330-1337` | Residual string contract. | Same code everywhere, and an IPC test. | XS |
| M2 | Actor: one store now, but three ways to get the user (`sessionGuarded` argument, direct `sessionUser`, ambient). Redundant override. Dead `sessionRequired`. | Low (was Med) | `main.js:332-335, 339-350, 808-1393` (7 direct), `:894` | Readers must know three idioms. See S1. | Fold into `guarded`, delete dead code. | S |
| N6 | Proposal action names from a regex. Triple rows on post. | Low (unchanged) | `bankReconciliationService.js:403, 778-779` | As before. | As before. | XS |
| N15 | `null` = keep on four masters, clear elsewhere | Low (unchanged) | `crudHelpers.js:76-83, 159` | As before. | As before. | XS |
| I1 | Lint list typed by hand. The new `profitSimulatorService.js` and the touched `authService.js` and `entitySearchService.js` are not checked. | Low (grew) | `package.json:25`: 26 of 53 tracked `src/main` JS files | A syntax error in the new service passes `lint:syntax`. | Glob. | XS |
| L1 | Policy in `main.js`: master-data bank check, and now the audit-trail filter | Low (grew) | `main.js:995-999`, `:850-855` | As before. | Move into services. | S |
| L2 | Refusals matched by text | Low (narrowed) | `init.js:1773` (main.js now uses a code) | As before. | Typed `code`. | XS |
| L6 | §4 sign-offs and §14 runs not shown | Low | (a)–(cc) carried over, plus (dd)–(mm) below. None of the 8 commit messages records either. | AGENTS.md §4, §14, §17. | List them in the PR for the owner. Record §14 and `verify:controls`. | XS |
| T1 | Two XML element walkers with different rules. Regexes rebuilt on every call. | Info (new) | `tallyImportService.js:41-61`; `importParserService.js:194-217` | Drift between importers. | One shared scanner with cached regexes. | S |
| G1 | Descriptive graph and doc data stale for the simulator and closure | Info (new) | `renderer-graph.json:1580-1617, 6210`; `workflow-graph.json:535`; `Developer-Module-Reference.md:349, 1639, 1912` | AI navigation and developer docs lag the code. No verify script fails. | Regenerate the renderer graph, add the channel to the reference. | XS |
| X1 | Unused route copy in `screenRegistry.jsx`, and a verify script checks it | Info | `config/screenRegistry.jsx:73`; `verify-entity-picker-integration.js:200-202` | A second route table that does not run. | Delete it, or make `App.jsx` use it, in a separate phase. | S |
| X2 | Entity search with no `company_id` still returns all companies' orders | Info | `entitySearchService.js:118` | §9 "no silent fallback". Callers pass it today *(inferred)*. | Refuse when a scoped entity has no company. | XS |
| M1, M3, N10, N11, N18, N19, L3–L5, L7, I2–I4 | As in the a97daf4 report | Low/Info (unchanged) | — | — | — | — |

## Previous findings (audit at a97daf4): status at 3c12e50

| # | Status |
|---|---|
| N12 | **`"1.0"` closed** (`crudHelpers.js:146`, test asserts `"0"`). Booleans are still accepted in every text column, and the `Date` message is unchanged. **Low.** |
| N13 | **Closed.** Cap restored to 2,000,000. No test imports the same 180k × 6 sheet as XLSX and as CSV. |
| N14 | **Message closed.** Still counts filled lines, so the Q5b regression stands. **Low.** |
| N15 | **Open**, unchanged. |
| N16 | **Closed.** Per-file message, 50 MB total, stock preview capped. A `statSync` error still counts as 0 bytes (`tallyImportService.js:460, 463`). |
| N6 | **Open** (Low): regex action names and triple rows. |
| N7 | **Open.** The signature gained a fourth optional parameter. |
| N8 | **Mostly closed.** Typed code. Other producers, two audit actions and IPC tests remain. |
| N9 | **One-column case closed.** Filled-row numbering remains, now also in `rowTooWide`. |
| N10, N11, N18 | **Unchanged.** |
| N17 | **Grew** (18 constants, duplicated Excel limit). |
| N19 | **New tests labelled correctly** ("a97daf4 round"). The old "219b2d3+1 round" labels remain. |
| M1 | **Unchanged.** |
| M2 | **Mostly closed** (one store, imports guarded, global gone). Residue is Low, and the grant gap is the new S1. `:879` (now `:894`) is still there. |
| M3 | **Unchanged.** |
| L1 | **Grew** (audit-trail filter in `main.js`). |
| L2 | **Narrowed** (`main.js` uses the code). |
| L3–L5, L7 | **Unchanged.** |
| L6 | **Still pending**, with ten new items. |
| I1 | **Grew** (27 of 53 unchecked). |

Sizes:

| File | a97daf4 | 3c12e50 |
|---|---|---|
| `main.js` | 1,427 | 1,438 |
| `init.js` | 2,124 | 2,124 |
| `crudHelpers.js` | 619 | 621 |
| `importParserService.js` | 405 | 446 |
| `tallyImportService.js` | 540 | 559 |
| `orderClosureService.js` | 64 | 81 |
| `profitSimulatorService.js` | — | 50 |
| `ProfitSimulatorScreen.jsx` | 278 | 252 |
| `App.jsx` | 1,683 | 1,685 |

## Owner sign-off needed under AGENTS.md §4

No accounting formula, posting math, GST calculation, inventory valuation, schema, IPC name, preload name or route key was changed. One channel and one preload method were added.

Carried over and not shown as approved: **(a)–(cc)** from the 92071b3, f833346, 219b2d3, a55b2d0 and a97daf4 reports.

New in this range:
- **(dd) Existing workflow: order closure.** Closing needs a posted invoice, nothing left to receive on any posted invoice (from the books' outstanding), and no saved-but-unposted invoice or receipt. One receipt is no longer enough (`orderClosureService.js:20-35`). This affects the dashboard pending counts. Profitability and posting are not affected.
- **(ee) Profitability what-if math (Profit Simulator).** Inputs are clamped (−100..1000 for adjustments, 0..100 for incentive and GST). A negative incentive or GST override is no longer accepted. Nothing is saved (`profitSimulatorService.js:47-53`).
- **(ff) Existing workflow: order picker.** Only the selected company's orders are shown (`entitySearchService.js:32-33`).
- **(gg) Approval behaviour: voucher proposals.** A review edit always returns the proposal to Needs Review, even when the screen sends "Approved". An "Already Booked" line cannot be edited (`bankReconciliationService.js:644, 657-659`).
- **(hh) Existing workflow: permissions.** Import parse, bank preview, feedback export and certificate generation now need `import`, `export` and `system_reset`. A viewer or data-entry user who could do these before is refused (`main.js:887, 937-943, 1344, 1397`).
- **(ii) Audit records.** Every use of the audited permissions writes a `permission_granted` row (`main.js:308-311`). Roles without `view_reports` no longer receive the audit trail in `accounting:data` (`:850-855`).
- **(jj) Save behaviour.** Yes/no values are stored as `"1"`/`"0"` text (`crudHelpers.js:146`).
- **(kk) Existing import workflow.** XLSX cap 2,000,000 cells. Rows over 16,384 cells refused while reading (CSV, TSV, HTML). Text values split into more than 1,000 runs refused. 32M stored characters of shared strings. The reply budget is counted in bytes, so non-Latin titles count double. Blank HTML rows count toward the 400,000-line limit (`importParserService.js`).
- **(ll) Existing Tally workflow.** The preview budget is 50 MB (was 25 MB). The stock preview is capped too.
- **(mm) Reversal behaviour.** A go-live rollback refusal is told apart by its code. The audit row keeps only the first 64 characters of the id and 500 of the reason (`main.js:1330-1332`).

## Test coverage of the new paths

Covered:
- SEC-1: ten high-impact channels refuse every role below admin, even when the screen claims super admin. Refusals name the real user. One grant row names the admin. Import, parse and bank preview need `import`. The audit trail is hidden from data entry. Byte arrays pass through `withActor`.
- Simulator: the service sums the baseline, prefers the cost basis, and caps incentive at 100%. The real report feeds it.
- Rollback refusal carries the code.
- Closure: a receipt alone is not settlement. An unposted invoice is open work. A posted unpaid invoice is named. The refusal message lists it. A stub of 0 settles.
- Order picker scoped by company.
- Import caps: entity-heavy text, inline cells, text runs, wide CSV and TSV rows, blank HTML rows, mixed-case tags, two-byte titles, correct entity decoding.
- Tally: 60,000 unclosed tags in under 2 s, ledgers still read.
- A proposal edit cannot approve.
- Booleans stored as `"0"`. 50 MB Tally per-file and total messages.

Not covered:
- Grant rows for `restore_backup`, `settings`, `financial_year_close` and `account_mapping` (S1 would have shown).
- `feedback:export` and `certificate:generate` permission. The commit claims them, but only the high-impact loop covers `certificate:generate`.
- `profitability:simulate` through IPC and preload. Clamps on negative values and the GST override branch.
- Closure through IPC with the real `outstandingFor`, settled by a real receipt allocation (the test settles with a stub). The default `storedOutstanding`. A posted invoice with no receivable row. A saved-but-unposted receipt.
- The GST rate read by `tallyGstRate` through the new scanner (the test only checks "L2"). Case-mixed Tally tags. A self-closing tag next to a full one.
- The Tally stock preview cap.
- The rollback refusal audit row and the rethrow of a fault, at IPC level (N8).
- XLSX and CSV parity at 180k × 6 (N13). TSV filled-line count (N14). `null` on keep-omitted masters (N15).
- The archive check failing on an unlisted file, or on an edited README (A1).

## Recommended order

1. **S1**: fold `sessionGuarded` into `guarded`, so every high-impact use writes its grant row. Fix the reopen permission, and add one IPC test per audited permission. This is the only place where a stated control is missing.
2. **C1**: make the closure's outstanding calculation a required dependency, or one shared function. Test the real allocation path and a missing receivable.
3. **P1 and P2**: fetch the profitability rows once, simulate from the baseline, and give browser preview a working or guided page.
4. **L6**: put (a)–(mm) in the PR for the owner, especially (dd), (ee), (gg) and (hh). Record the §14 run.
5. **A1**: protect the two archive READMEs and fail on unlisted reports.
6. Then N17 (`IMPORT_LIMITS`, one Excel column constant), N14, N9, N12, I1 (glob, so the new service is linted), C2, P3, N7, N8, M2 residue, N15, N6, T1, G1, L1, L2.

None of these needs a schema, IPC rename, preload rename or route-key change. Relabelling stored `closure_checklist` JSON on orders closed earlier (C2) would touch existing records and needs §4 approval first.
