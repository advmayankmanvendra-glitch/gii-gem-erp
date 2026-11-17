# Phase AW-0 / AW-1 — Audit Watch — Phase Report

**Phase name:** AW-0 check catalogue and AW-1 read-only engine and screen (Audit Watch)
**Date:** 17 Nov 2026 (IST)
**Branch:** `claude/project-thread-sabksq` (off `main` at 2c79106)
**Approval:** owner approved the scoping plan on 17 Nov 2026, 7:02 PM IST ("Approve, start AW-0 then AW-1")

## Feature Classification

- **Primary category:** Intelligence (detective controls over the books)
- **Secondary categories:** Reporting, Security, Governance
- **Why:** Audit Watch lists exceptions an internal auditor or CA should look at. It only reads. It adds a new screen, two read-only IPC channels and a permission. It changes no posting, GST, inventory or profitability logic.
- **Product maturity stage:** Decision Support

## Dependency Assessment

| Dependency | Status |
|---|---|
| Ledger guards and paise columns (PR #5) | Present |
| Account-group mapping (FSR-2B.1, `account_group_assignments`) | Present; used to pick sensitive, cash and clearing ledgers |
| `stockBalance`, `bookIntegrityChecks`, `verifyAuditChain` | Present; reused, given a read-only connection |
| AG-1, KG-5, DG-1 graphs | Present; AG-1 raised to 1.1.0 (additive) |
| ACC programme (purchase-order lines, policy settings) | Not merged; AW-P09 and AW-T06 wait, and the verifier fails once what they wait for arrives |

**Dependencies Satisfied: Yes** (for the 37 runnable checks)

## Files Changed

### Created

- `src/main/services/auditWatch/catalogue.js`: the single source for each check (area, severity, version, scope, reads, limits, wording)
- `src/main/services/auditWatch/checks.js`: one read-only function per runnable check
- `src/main/services/auditWatch/auditWatchService.js`: runner (role areas, dates, read-only connection, one snapshot)
- `src/main/services/auditWatch/auditWatchRunner.js`, `auditWatchWorker.js`: runs off the main thread, time limit, one run at a time in the whole process, in-process fallback
- `src/main/services/auditWatch/stockBalances.js`: every item and warehouse balance in grouped reads, for AW-I01 and AW-I02, through the run's read-only query helper. It follows the same rules as `stockBalance`; a randomised parity test, a fixed-value test and a hash of `inventoryService.js` (checked by the verifier) hold the two together
- `src/main/database/postingSources.js`: classifies every `source_module` (manual, guided, document, system-dated)
- `src/renderer/features/reports/auditWatch/AuditWatchScreen.jsx`, `src/renderer/styles/auditWatch.css`
- `scripts/build-audit-watch-graph.js`, `scripts/verify-audit-watch.js`, `scripts/smoke-audit-watch.mjs`
- `scripts/lib/verifyErpRules.mjs`: reads `verify-erp.js`'s PIPELINE and run loop and checks the rules that keep the Audit Watch steps strict and lock-blocking (used by the verifier; the test suite runs it on patched copies of `verify-erp.js` to show each rule refuses what it should)
- `scripts/lib/run-as-electron-node.mjs`: runs a Node script or `node --test` on Electron's Node, for the `:electron` npm scripts
- `scripts/audit/lib/workers/startedThenBusy.mjs`, `startedThenCrash.mjs`: test workers for the runner's lock and crash handling
- `scripts/audit/audit-watch.test.mjs`, `scripts/audit/lib/auditWatchFixtures.mjs`
- `src/main/services/auditWatch/` holds the files above; `src/renderer/styles/auditWatch.css` is imported once from `src/renderer/styles/app.css`
- `docs/manuals/GII-GeM-ERP-Audit-Watch-Guide.md` (generated, KG-5)

### Modified

- `src/main/main.js`: two channels, `audit-watch:catalogue` and `audit-watch:run` (session-guarded, read-only); restore, reset and rollback are refused while a run is in progress
- `src/main/services/authService.js`: `audit_watch` permission for admin, accountant and manager
- `src/preload/preload.cjs`: `getAuditWatchCatalogue`, `runAuditWatch`
- `src/main/database/init.js`: exports `runAuditWatch` and `auditWatchCatalogue`
- `src/main/services/errorConsoleService.js`: the `voucher_balance` and `audit_chain` book checks also return `failingDigest`, a fixed-size count and digest of every failing id (additive; no screen reads it). Pass/fail results do not change; the Health detail now adds "and N more" when more failures exist than it lists
- `src/main/database/init.js` `verifyAuditChain`: checks the whole chain instead of stopping at 20 broken rows, and adds `brokenCount` and `brokenDigest`. It still lists at most 20, and `verified` now counts only rows present that fail their hash (deleted rows no longer lower it)
- `src/main/services/inventoryService.js`: **unchanged** (byte-identical to `main` 2c79106). An earlier round shared its balance rules with Audit Watch; round 5 put it back, because stock valuation is AGENTS.md rule 4 territory
- `scripts/lib/masterVerificationPolicy.js`: `verify:audit-watch` and `test:audit-watch` are lock-blocking
- `src/renderer/App.jsx`: one import and one route line (no logic)
- `src/renderer/config/navigation.js`: Reports > Internal Audit > Audit Watch
- `src/renderer/knowledge/modules/reports.js`: help metadata KNG-RPT-026
- AG-1 graph and schema (1.1.0, detectiveControls, KG-5 dependency), KG-5 graph and builder, graph registry, manual index
- `package.json`: `@babel/parser` added to devDependencies (already installed through the build tools; the Audit Watch verifier reads code with it). The verifier's ajv call sets `validateFormats: false`, which only silences a warning: the schema's one format was already ignored
- `scripts/verify-audit-graph.js` (accepts schema 1.1.0)
- `scripts/verify-erp.js`: adds verify:audit-watch and test:audit-watch as frozen, strict, blocking steps; PIPELINE is `Object.freeze([...])`; the run loop applies `strictExitCode` to every step; `run()` returns the command it ran, the run loop records it for the lock gate (which blocks locking if a strict step ran another command), and the verifier checks statically that the run loop calls `run(step.cmd)` and `run()` passes it unchanged to `execSync`
- `scripts/verify-master-verification-policy.js`: 16 checks, including strict steps, whole-number exit codes and expected strict commands
- `scripts/audit/ipc-security.test.mjs`: covers the two new channels
- `scripts/build-manual-graph.js`, `src/renderer/modules/erpBrain/loaders/manualLoader.js`, `src/renderer/modules/erpBrain/data/manualIndex.js`: list the Audit Watch guide in KG-5
- `src/renderer/styles/app.css`: one import line for `auditWatch.css`
- `package.json`, `package-lock.json`: the Audit Watch npm scripts and `@babel/parser`

## IPC, Route and Database Impact

- **IPC/preload:** two new channels and two new preload methods; nothing renamed.
- **Route keys:** new `audit_watch`; no existing key changed.
- **Database:** no schema change and no migration. Audit Watch opens its own read-only connection.
- **Business logic preserved:** Yes. No posting, reversal, GST, valuation or profitability code changed.

## Enterprise Intelligence Layer

AG-1 carries the `detectiveControls` section generated from the catalogue (schema 1.1.0, additive), including each check's typed `uncovered` and `waitsFor` canaries. KG-5 lists the Audit Watch guide. The registry records the builder and validation commands. The test suite traces the SQL every check runs and fails when the catalogue's `reads` (and so AG-1) leaves anything out.

## Verification

| Command | Result |
|---|---|
| `npm run lint:syntax` | Pass |
| `npm run build` | Pass |
| `node scripts/verify-audit-watch.js` | 43 passed, 0 failed (also validates AG-1 against its schema, pins `inventoryService.js`, checks the exact wiring, checks that verify:erp runs both frozen Audit Watch steps, applies `strictExitCode` to them, runs exactly the command written in PIPELINE (the run loop calls `run(step.cmd)`, and `run()` passes it unchanged to `execSync`), and that their npm scripts are unchanged) |
| `node --test scripts/audit/audit-watch.test.mjs` | 83 of 83 pass (also on Electron's Node) |
| IPC security tests | 57 of 57 pass |
| `verify-audit-graph`, `verify-manual-graph`, `verify-governance-graph-registry`, `verify-knowledge`, `verify-erp-brain`, `verify-help-assistant-brain`, `verify-audit` | All pass |
| `npm run test:integrity` | 304 of 304 pass, then IPC 57 of 57 |
| `node scripts/verify-master-verification-policy.js` | 16 of 16 pass (includes the strict Audit Watch steps, whole-number exit codes and the expected strict commands) |
| `verify:accounting`, `verify:financials`, `verify:controls`, `verify:voucher-inventory`, `verify:flow`, `verify:phase10` | All pass (exit 0), run with Electron and `--no-sandbox`, because the container runs as root |
| `npm run verify:erp` | Lint, build and every step up to and including `verify:audit-watch` and `test:audit-watch` pass. In this container the Electron-launched steps cannot start as root without `--no-sandbox` (run separately above), and the pipeline stops at `verify:financial-reports`, which launches Electron itself and also fails on `main`. On Windows these steps launch normally. |

Two verifiers already fail on `main` and are not touched here: `verify-alphabetical-option-order` and `verify-financial-report-structure`.

## Desktop Smoke Test

`xvfb-run node scripts/smoke-audit-watch.mjs` on a fresh data folder: 9 of 9 pass. It signs in, opens Reports > Internal Audit > Audit Watch, runs every check (all five areas for an admin, none failing), confirms the run happened in a worker thread, opens a finding's rows, checks there is no sideways scroll at 390 px, and finds no console errors.

## In-house Audits

Three audits ran at 3a80616 (correctness, security, architecture). Later rounds ran two (correctness and security together, and architecture), at e9dd130, 1b9f377, cda689c, a1f848a, a37ff99, 1e790c0, d904b99, 346d165, 354d4de, b469c16, 5918927, a6dae56, 0858cff, 6a71786, 61406f7, 2a67195 and 0e5ce5a. The findings and what was done about each are in the project's audit folder (`audits/2026-11-16-audit-watch/audit-3a80616-response.md`, `audit-e9dd130-response.md`, `audit-1b9f377-response.md`, `audit-cda689c-response.md`, `audit-a1f848a-response.md`, `audit-a37ff99-response.md`, `audit-1e790c0-response.md`, `audit-d904b99-response.md`, `audit-346d165-response.md`, `audit-354d4de-response.md`, `audit-b469c16-response.md`, `audit-5918927-response.md`, `audit-a6dae56-response.md`, `audit-0858cff-response.md`, `audit-6a71786-response.md`, `audit-61406f7-response.md`, `audit-2a67195-response.md` and `audit-0e5ce5a-response.md`).

## UX Compliance Checklist

Against `docs/architecture/global-ux-governance-standard.md`:

| Area | Check | Status |
| --- | --- | --- |
| App.jsx protection | One import and one view line; all logic is in `src/renderer/features/reports/auditWatch/` | Met |
| Navigation | Reached through the central navigation (Reports > Internal Audit > Audit Watch); uses the app's back behaviour | Met |
| Scroll/focus | Opening a check or a finding expands in place, without moving the page. Focus is not moved to the results after a run | Partly met |
| Toolbar | One action (Run checks) after the period and area controls. There is no standard report toolbar (print, export, refresh) yet | Partly met |
| Keyboard | No new shortcuts, and nothing can be posted from this screen. The app's Smart Enter moves between fields and, on the last field, asks "Save Record?" before running, which reads oddly on a screen that saves nothing | Met (shortcuts are safe), with a gap |
| Search | No search on this screen. The sidebar search finds it by name | Not applicable |
| Feedback | The button reads "Checking..." and is disabled while a run is in progress; errors show as a notice | Met |
| Empty states | Before a run: how many checks the role can run and what to do. After a run: "No check found anything for this period and area" or "No checks in this area" | Met |
| Tables | Each finding row has one details button (with aria-expanded) that opens its rows | Met |
| Help | Help metadata KNG-RPT-026 and the KG-5 Audit Watch guide | Met |
| AI safety | No AI. The checks are fixed SQL and only read | Met |
| Recovery | Nothing risky: no writes. Restore, reset and rollback are refused until a run finishes | Met |
| Verification | lint, build, accounting and financial verifiers run (see Verification) | Met |
| Report | Known limitations are listed below | Met |

Known gaps: Smart Enter's "Save Record?" prompt on the last field; no report toolbar (print, export, refresh); focus stays on the form after a run. Each finding shows at most 20 supporting rows and 12 columns, and the screen now says so under the rows. The screen was checked at 390 px and desktop width by the smoke test.

## Production Readiness

- **Classification:** Internal Testing
- **Gate result:** Not yet Beta. It needs a clean re-audit at head, external review, the owner's go to merge, and a run on a real company's books.

## Known Limitations

- Master Data Tools change bank details in bulk with one audit row per batch. AW-T04 shows the batch, but AW-P03 cannot tie a later payment to a bulk change until master import writes one audit row per record.
- The app does not yet record role changes, so AW-T04's role branch stays quiet until it does.
- Limits are the catalogue defaults; per-company limits and a review trail come in AW-2.
- RG-1 is not regenerated in this phase, because rebuilding it churns heavily on `main` as well. The navigation entry and KNG-RPT-026 answer "where is Audit Watch?".
- A packaged build that cannot start the worker falls back to running in the main process, still read-only. The run is then bounded by the linear checks, not by the time limit, and the screen says so. A worker that started and then failed is never re-run in the main process.
- Bank ledgers are told apart from cash ledgers by name (AW-G09), because the banks table does not name its ledger.
- AW-I01 adds quantities exactly in micro-units; an item and warehouse whose opening stock and movements up to the period end pass about 9 billion units is listed under the check as "not checked" (not counted as a finding) instead of being given a doubtful answer; every other pair is still checked.
- After the 120-second limit the worker is terminated, but a long SQLite statement cannot be interrupted, so the worker may read on for a while before it exits. The run lock is held until it exits.

## Lock Note

Stable: the catalogue, the 37 runnable checks, the read-only runner and the screen. Out of scope: storing runs, reviews and per-company limits (AW-2), Ask ERP answers (AW-3), and the two ACC-dependent checks.

**Safe to lock:** No. It can be locked once the re-audit is clean and the owner approves the merge.
