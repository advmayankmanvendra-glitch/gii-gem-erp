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
- `src/main/services/auditWatch/auditWatchRunner.js`, `auditWatchWorker.js`: runs off the main thread, time limit, one run at a time, in-process fallback
- `src/main/database/postingSources.js`: classifies every `source_module` (manual, guided, document, system-dated)
- `src/renderer/features/reports/auditWatch/AuditWatchScreen.jsx`, `src/renderer/styles/auditWatch.css`
- `scripts/build-audit-watch-graph.js`, `scripts/verify-audit-watch.js`, `scripts/smoke-audit-watch.mjs`
- `scripts/audit/audit-watch.test.mjs`, `scripts/audit/lib/auditWatchFixtures.mjs`
- `docs/manuals/GII-GeM-ERP-Audit-Watch-Guide.md` (generated, KG-5)

### Modified

- `src/main/main.js`: two channels, `audit-watch:catalogue` and `audit-watch:run` (session-guarded, read-only); restore, reset and rollback wait while a run is in progress
- `src/main/services/authService.js`: `audit_watch` permission for admin, accountant and manager
- `src/preload/preload.cjs`: `getAuditWatchCatalogue`, `runAuditWatch`
- `src/main/database/init.js`: exports `runAuditWatch`, `auditWatchCatalogue`, `stockBalances`
- `src/main/services/inventoryService.js`: adds `stockBalances` (every item and warehouse balance in one pass, by `stockBalance`'s rules; read-only, posting code unchanged)
- `src/renderer/App.jsx`: one import and one route line (no logic)
- `src/renderer/config/navigation.js`: Reports > Internal Audit > Audit Watch
- `src/renderer/knowledge/modules/reports.js`: help metadata KNG-RPT-026
- AG-1 graph and schema (1.1.0, detectiveControls, KG-5 dependency), KG-5 graph and builder, graph registry, manual index
- `scripts/verify-audit-graph.js` (accepts schema 1.1.0), `scripts/verify-erp.js` (adds verify:audit-watch and test:audit-watch as blocking steps), `package.json`

## IPC, Route and Database Impact

- **IPC/preload:** two new channels and two new preload methods; nothing renamed.
- **Route keys:** new `audit_watch`; no existing key changed.
- **Database:** no schema change and no migration. Audit Watch opens its own read-only connection.
- **Business logic preserved:** Yes. No posting, reversal, GST, valuation or profitability code changed.

## Enterprise Intelligence Layer

AG-1 carries the `detectiveControls` section generated from the catalogue (schema 1.1.0, additive). KG-5 lists the Audit Watch guide. The registry records the builder and validation commands. The test suite traces the SQL every check runs and fails when the catalogue's `reads` (and so AG-1) leaves anything out.

## Verification

| Command | Result |
|---|---|
| `npm run lint:syntax` | Pass |
| `npm run build` | Pass |
| `node scripts/verify-audit-watch.js` | 35 passed, 0 failed |
| `node --test scripts/audit/audit-watch.test.mjs` | 67 of 67 pass |
| IPC security tests | 57 of 57 pass |
| `verify-audit-graph`, `verify-manual-graph`, `verify-governance-graph-registry`, `verify-knowledge`, `verify-erp-brain`, `verify-help-assistant-brain`, `verify-audit` | All pass |
| `npm run test:integrity` | 289 of 289 pass, then IPC 57 of 57 |
| `verify:accounting`, `verify:financials`, `verify:controls`, `verify:voucher-inventory`, `verify:flow`, `verify:phase10` | All pass (exit 0), run with Electron and `--no-sandbox`, because the container runs as root |
| `npm run verify:erp` | Lint, build and every step up to and including `verify:audit-watch` and `test:audit-watch` pass. In this container the Electron-launched steps cannot start as root without `--no-sandbox` (run separately above), and the pipeline stops at `verify:financial-reports`, which launches Electron itself and also fails on `main`. On Windows these steps launch normally. |

Two verifiers already fail on `main` and are not touched here: `verify-alphabetical-option-order` and `verify-financial-report-structure`.

## Desktop Smoke Test

`xvfb-run node scripts/smoke-audit-watch.mjs` on a fresh data folder: 9 of 9 pass. It signs in, opens Reports > Internal Audit > Audit Watch, runs every check (all five areas for an admin, none failing), confirms the run happened in a worker thread, opens a finding's rows, checks there is no sideways scroll at 390 px, and finds no console errors.

## In-house Audits

Three audits ran at 3a80616 (correctness, security, architecture), and again at e9dd130 and 1b9f377. The findings and what was done about each are in the project's audit folder (`audits/2026-11-16-audit-watch/audit-3a80616-response.md`, `audit-e9dd130-response.md` and `audit-1b9f377-response.md`).

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

## Lock Note

Stable: the catalogue, the 37 runnable checks, the read-only runner and the screen. Out of scope: storing runs, reviews and per-company limits (AW-2), Ask ERP answers (AW-3), and the two ACC-dependent checks.

**Safe to lock:** No. It can be locked once the re-audit is clean and the owner approves the merge.
