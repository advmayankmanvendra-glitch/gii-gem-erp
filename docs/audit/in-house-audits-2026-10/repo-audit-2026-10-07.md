# GII GeM ERP — Repository Audit (2026-10-07)

Scope: read-only assessment of `advmayankmanvendra-glitch/gii-gem-erp` at `main` = `aec83eb` (last commit 2026-06-25, "Enhance ERP print templates and report print coverage"). No code was changed.

## 1. Bottom line

The ERP is a **working, broad internal-test build** (version `0.1.0-internal-test`), not a production release. It builds, every official verification script passes, the Electron app launches, login + forced password change work, and all 155 sidebar screens open without a crash or console error. The accounting core (balanced vouchers, ledger, trial balance, P&L, balance sheet, GST, receivables/payables, allocations, inventory with COGS, bank import, CRAC/order closure) is implemented and self-verifying.

What stands between this and "fully functional" is mostly **depth and hardening**, not missing modules:

1. Security model is advisory: the backend trusts a user id sent from the screen, and falls back to the admin when none is sent. There is no user-management screen.
2. One confirmed accounting-date defect: expense accruals post on today's date instead of the transaction date.
3. Some workflows have no undo: posted stock movements cannot be reversed, deactivated records cannot be restored.
4. Three sidebar items (Department Profitability, Supplier Profitability, Profit Simulator) show the same Order Profitability screen.
5. Architecture debt that contradicts the repo's own rules: `App.jsx` is 13,250 lines and `init.js` is 9,146 lines.
6. No CI, no real linter, no automated UI tests; the governance pipeline is enforced only by discipline.

## 2. Governance rules in the repo

| Document | What it governs |
|---|---|
| `AGENTS.md` (v3.1, 469 lines) | 24 rules: audit-first, App.jsx protection, modular placement, preserve core logic (accounting/GST/posting math, schema, IPC names, route keys), company-context safety, import safety, error-guidance wording, mandatory verification commands, desktop smoke test, end-of-phase report, stop rules, feature classification, dependency assessment, production readiness gate, final checklist |
| `docs/architecture/permanent-architecture-rules.md` | Longer form of Layer 1 rules |
| `docs/architecture/global-ux-governance-standard.md` | Layer 2: navigation, toolbar, keyboard, search, help, tables, accessibility |
| `docs/architecture/phase-governance-pipeline.md` | Idea → Audit → Compliance → UX check → Implement → Verify → Smoke test → Commit → Tag (major only) → Lock note |
| `src/docs/UX-STANDARDS.md` | UX standards |
| `docs/reports/*.md` | Three historical audit/reconciliation notes from June 2026 |

Not present: `CLAUDE.md`, `.github/` (no CI workflows, no PR template, no CODEOWNERS), branch protection evidence, any Git tags (the pipeline calls for tags at major milestones; there are none). `reports/*` is gitignored (`.gitignore`), so the end-of-phase reports the rules require are **not in the repository** — they only exist on whichever machine produced them.

Commands in AGENTS.md use `npm.cmd` (Windows). History is 44 commits, all by "Gesture India".

## 3. Architecture

- **Stack:** Electron 37 + React 19 + Vite 7 + better-sqlite3 12, offline single-machine Windows desktop app, packaged with electron-builder (NSIS + portable).
- **Main process:** `src/main/main.js` (846 lines) registers 118 IPC handlers; services in `src/main/services/` (backup, health, CRAC, payment readiness, order closure, master data tools, support bundle, verification).
- **Database layer:** `src/main/database/init.js` (9,146 lines) holds schema (62 tables), 27 versioned migrations (`schema_migrations`), seed data, and essentially all business logic: posting, GST, allocations, inventory, reports, imports, permissions.
- **Preload:** `src/preload/preload.cjs` with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (`main.js:382-407`) — correct Electron hardening.
- **Renderer:** `src/renderer/App.jsx` (13,250 lines, 40 top-level components) plus extracted `components/`, `screens/`, `config/`, `modules/helpAssistant/`, `print/`, `stability/`. Only 2 of the 9 `features/` folders named in AGENTS.md exist (`features/inventory`, `features/reports`).
- **Navigation:** 167 view titles, 155 distinct sidebar items (`src/renderer/config/navigation.js`), route aliases at `navigation.js:262-284`.
- **Runtime data:** dev mode writes to the project folder; packaged mode writes to `%APPDATA%\GII GeM ERP` and copies a bundled DB on first run (`main.js:168`).

## 4. What I ran and the results

| Check | Result |
|---|---|
| `npm ci` | OK |
| `npm run lint:syntax` | Pass (note: only `node --check` on 5 files; JSX is not linted) |
| `npm run build` | Pass; single 1.23 MB JS chunk (Vite warns > 500 kB) |
| `verify:accounting` | Pass — TB difference 0, input GST 1,26,000, output GST 1,80,000 |
| `verify:financials` | Pass |
| `verify:controls` | Pass |
| `verify:voucher-inventory` | Pass |
| `verify:flow` | Pass — trial balance difference 0 |
| `verify:phase10` | Pass |
| `verify-company-context-isolation.js` | Pass |
| `verify-phase8b-voucher-proposals.js` | Pass |
| `accounting-single-entry-ledger-test.js`, `backup-restore-validation.js`, `stability-edit-backup-smoke.js` | Pass |
| `desktop-functional-stabilization.js` | **Fail** — "Voucher JOURNAL-00001 missing from register" (see 5.2) |
| Electron desktop smoke (headless, Linux, Xvfb) | App launches, login + forced password change OK, dashboard loads, **155/155 sidebar screens open** with no crash panel, no blank screen and no console errors |

Caveats: verification scripts were run under Node rather than the Electron binary (same code; native module built for Node). The smoke test was on Linux, not Windows, and checked that screens open, not every action on them. Print/export/save actions were not exercised.

## 5. Gaps and defects (most important first)

### 5.1 Permission enforcement can be bypassed — High
- `guarded()` (`src/main/main.js:199`) takes the user id from the request payload sent by the screen (`userContext`, `main.js:155`).
- If no user id is sent, `userForPermission` (`src/main/database/init.js:260-263`) **falls back to the first active admin**.
- 51 of 118 IPC handlers are unguarded, including `audit:context` (writes to the audit log, `main.js:700`) and all read/report handlers. The main process keeps no logged-in session, so these work before login too.
- Six roles are defined (`init.js:192-199`) but there is **no screen to create or manage users**; only the seeded `admin` exists.
- Impact: role restrictions are cosmetic. Acceptable for a single-user PC, not for multi-user or audit-grade use.

### 5.2 Expense accruals are dated today, not on the transaction date — Medium (accounting)
- `postExpenseAccrualsForOrder` (`src/main/database/init.js:6716-6729`) posts with `voucher_date: new Date()`.
- An expense for a June order posted in October lands in October, possibly in a different financial year. This is why `desktop-functional-stabilization.js` fails: its June-filtered register cannot find the voucher.
- Voucher reversal (`init.js:5831`) also always uses today's date with no option to choose; that may be intended but is worth a decision.
- Per AGENTS.md rule 4, fixing this changes posting behaviour and needs your explicit approval.

### 5.3 Missing undo workflows — Medium
- No reversal for posted stock movements (only `reverseVoucher` `init.js:5818` and `reverseAdvanceAdjustment` `init.js:6498` exist). Reversing a COGS voucher does not restore stock.
- No restore or reactivate for soft-deleted or inactive records.
- Both were open findings in `docs/reports/opencode-edit-delete-correction-control-audit-history.md` and are still open.

### 5.4 Placeholder sidebar items — Low/Medium
- `department_profitability`, `supplier_profitability`, `profit_simulator` all alias to `profitability` (`navigation.js:278-280`) and show identical figures. There is no department view, supplier view or simulator.
- Business voucher items (contra, commission, etc.) route to one shared voucher screen by kind. That works by design.

### 5.5 Government-supply compliance features not present — gap vs. goal
- No GST e-invoice (IRN/QR), e-way bill, or GSTR-1/GSTR-3B return export. GST registers and summaries exist, but not filing-ready outputs.
- Print templates (`src/renderer/print/templates/*.jsx`) are generic, driven by field hints over whatever data is loaded, not fixed statutory layouts.

### 5.6 Architecture debt vs. the repo's own rules — Medium (maintainability)
- `App.jsx` at 13,250 lines contains business screens (billing 889 lines, accounting 736, operations 965, Tally migration 721) and a ~1,000-line browser-preview mock API (`App.jsx:12216` onwards) that re-implements profit calculation and voucher proposals in the renderer. That conflicts with AGENTS.md rules 2 and 7.
- `init.js` at 9,146 lines mixes schema, migrations, seed and every domain service.
- On first load the app selects the first company automatically if none was saved (`App.jsx:324-328`). The company stays visible, but rule 9 says "no silent fallback to first company".

### 5.7 Engineering hygiene — Medium
- No CI: nothing runs the verify scripts on push or PR.
- No ESLint or type checking; `lint:syntax` skips all renderer code.
- No renderer/UI test suite; desktop smoke tests are manual.
- Phase reports are gitignored, so the evidence trail for "locked" phases is outside the repo.
- `docs/reports/d-workspace-report-reconciliation-2026-06-20.md` is stale: the Migration 027 and Phase 15I code it said was missing **is now present** (`027_audit_and_posting_control_fixes`, `crac_records`, CRAC screens).
- `verify:accounting` and `verify:financials` run against the working database, not a temp copy, so on a real company DB with no GST data `verify:accounting` would report failure. Three non-gate scripts (`accounting-single-entry-ledger-test.js`, `stability-edit-backup-smoke.js`, `desktop-functional-stabilization.js`) write test vouchers into the working database.

## 6. What is solid

- Double-entry core with balanced-voucher enforcement, ledger, day/cash/bank books, TB, P&L, balance sheet; all verified at zero difference.
- Receivables/payables with bill-wise allocation, advances, ageing, TDS/GST-TDS reconciliation, credit terms.
- Inventory: inward/outward, reservations, delivery challans, transfers, adjustments with approval, returns, serial/batch registers, valuation, COGS posting.
- Bank statement import → voucher proposals → approval → posting, with direct posting blocked.
- Financial years (Apr–Mar enforced), year-end close, carry forward, opening balances, approval queue, audit log.
- Import safety: staged preview, batches, rollback; Tally XML and master migration assistants.
- CRAC management, payment readiness, order closure.
- Backup/restore (locked v1.0), health center, safe mode, renderer error boundary, support bundle.
- Electron security flags correct; passwords hashed with scrypt; default admin forced to change password.

## 7. Suggested order to reach "fully functional"

1. **Security phase:** hold the logged-in session in the main process, remove the admin fallback, guard all handlers, add a user-management screen. (Category: Security)
2. **Accounting-date fix:** post expense accruals on the transaction date. Decide on reversal-date policy. Needs explicit approval under rule 4. (Category: Accounting)
3. **CI + lint:** GitHub Actions running build + all verify scripts on each PR; ESLint for JSX; commit phase reports or a summary of them. (Category: Governance)
4. **Correction workflows:** stock movement reversal; restore/reactivate for masters. (Category: Inventory / Operations)
5. **Real screens** for Department/Supplier Profitability and Profit Simulator, or remove them from the sidebar. (Category: Reporting)
6. **Compliance outputs:** GSTR-1/3B export, e-invoice/e-way bill data, if needed for the GeM business. (Category: Reporting / Import-Export)
7. **Ongoing modularization:** move App.jsx business screens into `features/*`; split `init.js` by domain. Do this alongside the phases above, not as a big-bang refactor (rule 6).
8. **UAT on Windows** with real company data, then decide whether it is a Release Candidate.

Production readiness today: **Internal Testing / Beta**. Not safe to call production-ready until items 1–3 are done and Windows UAT is completed.
