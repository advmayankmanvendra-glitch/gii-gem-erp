# Electron Cross-ERP Bug and Correction Audit

**Date:** 18 July 2026  
**Tester:** Codex independent desktop audit  
**Repository:** GII GeM ERP  
**Branch:** `phase-16-enterprise-crm-integration`  
**Baseline:** `82b2a19` / `gii-gem-erp-v1.0.0-rc1-2026-07-17`  
**Mode:** Live Electron inspection, source confirmation, and verification only  
**Final decision:** **BLOCKED - stabilize before lock, commit, tag, or release packaging**  
**Safe to lock:** **No**

## Scope and Method

The ERP was restarted in a clean development session and inspected in the live Electron window. Representative master, operations, inventory, accounting, GST, reporting, profitability, help, search, and utility workflows were opened. No record was saved, posted, reversed, approved, deleted, imported, restored, or otherwise mutated.

The live session used the existing command:

```text
npm run dev
```

The tested screens and interactions were:

| Area | Screen or interaction | Result |
|---|---|---|
| Shell | Login/session, Dashboard, sidebar, company context | Opens; visual/data-quality issues remain |
| Search | Global Search with Supply Orders, Business Voucher, Sales Register, Stock Inward, Trial Balance, Billing Voucher, Profitability | Partial; missing and poorly ranked results |
| Masters | Departments | Opens; list is alphabetized but data is contaminated |
| Operations | Supply Orders | Opens; selectors generally alphabetized |
| Inventory | Stock Inward | Opens; supplier contamination and no warehouse option |
| Billing | Billing Voucher | **Blank main workspace** |
| Accounting | Receipt Voucher / Voucher Dashboard | Opens; context and interaction defects remain |
| Accounting | Trial Balance | Opens; default period crosses the active financial year |
| Financial Control | Financial Control dashboard | Opens; default period crosses the active financial year |
| GST | GST Register and GST Summary | Opens; period, empty-state, and toolbar issues remain |
| Receivables/Payables | Payables | Opens; misleading mode and implementation-language empty state |
| Reporting | Financial Reports index | Opens; incomplete direct actions |
| Profitability | Order Profitability | Opens; finance wording needs review |
| Help | Learn This Screen and GII ERP Help Assistant | Opens; major answer, terminology, and submit defects |
| Utilities | Expanded and compact right utility modes | Expanded usable; compact mode materially broken |

## Release Blockers

### ERP-001 - Billing Voucher workspace is blank - Critical

**Evidence:** The Billing Voucher route displays the breadcrumb, title, help actions, sidebar, and utility panel, but no billing form or content appears in the main workspace. The defect was reproduced after a clean Electron restart.

**Source confirmation:** `src/renderer/App.jsx` imports `BillingVoucherScreen`, excludes `invoices` from the generic `TransactionScreen` at line 1305, and contains no render condition that mounts `BillingVoucherScreen`. The imported component is therefore unreachable.

**Required correction:** Restore an explicit, governed `invoices` render branch using the existing `BillingVoucherScreen`, then verify invoice create/edit, line entry, GST preview, save, post, print/export, back navigation, and company context in Electron.

### ERP-002 - Safe-delete verification fails and master deletes bypass the generic guard - Critical

**Evidence:** `npm run verify:safe-delete` failed with **6 passed / 17 failed**. Missing protections include imported-item dependencies across order, procurement, invoice, stock, reservation, GRN, delivery-challan, batch, serial, movement, and transfer tables.

The dirty working tree also changes `src/main/main.js:780-784` so `assertDeleteSafe()` is skipped whenever `MASTER_TABLES[table]` is present. This broad bypass is not justified by passing evidence.

**Required correction:** Conduct a dedicated safe-delete audit before accepting the current `records:delete` change. Reinstate dependency protection for every master unless a table-specific, tested deletion policy proves the operation safe. No release should proceed while this verification fails.

### ERP-003 - Help Assistant submits a duplicated question and answers the wrong location - High

**Evidence:** Submitting `Where is Bill History?` produces the submitted question `Where is Bill History?Where is Bill History?`. It then directs the user to **Bill-wise Receivable**, while live search results rank **GST TDS Reconciliation**. The required location answer is not reliably supplied.

**Governance impact:** This fails Permanent Architecture Rule 32, which requires navigation/location queries to be answered directly from user-facing navigation metadata.

**Required correction:** Fix the controlled-textarea submit path, add a deterministic Bill History navigation mapping, separate `bill`, `billing`, `history`, `TDS`, and `receivable` intent tokens, and add an Electron interaction test in addition to isolated relevance tests.

### ERP-004 - Internal intelligence terminology leaks into the normal Help Assistant - High

**Evidence:** The same normal-user answer visibly contains `BRAIN-2 source-backed guidance`, `Brain Source`, `repository`, and `workflow-graph`. The Help screen also shows `GUIDANCE-ONLY ASSISTANT`, `ADMIN GUIDANCE ONLY`, `Data Mode`, and a phase-oriented safety boundary.

**Source confirmation:** `src/renderer/modules/helpAssistant/helpAssistantUtils.js:284-303` deliberately assigns `Brain Source`, `BRAIN-2 source-backed guidance`, and raw source kinds to the user-facing answer.

**Required correction:** Keep internal architecture identifiers in diagnostics only. Normal users should see plain names such as `ERP Help`, `Workflow Guide`, `User Manual`, and `Accounting Guidance`.

### ERP-005 - Electron development launcher can attach to a stale renderer - High

**Evidence:** The first audit session had Vite on port 5174 while Electron remained hard-wired to port 5173 and displayed another already-running renderer. `package.json:14` allows Vite to select another port but independently waits for and opens 5173.

**Required correction:** Use a strict fixed port that fails if occupied, or pass the actual selected Vite URL to Electron. Add a startup assertion showing the renderer build/session identity.

### ERP-006 - Multiple ERP instances are allowed - High

**Evidence:** Multiple Electron sessions could run against the same development data root. No `app.requestSingleInstanceLock()` or `second-instance` handling exists in `src/main/main.js`.

**Required correction:** Add a desktop single-instance lock and focus the existing window when a second launch is attempted. Verify no unsafe concurrent SQLite session is created.

### ERP-007 - Screen-action verification is red - High

**Evidence:** `npm run verify:screen-actions` failed **0 passed / 3 failed** for `opening_balances.add_opening`: expected render marker, handler, and `data-action-key` wiring were not found.

**Required correction:** Reconcile the verifier with the current modular implementation or restore the governed action markers. The verifier must pass before certification; a visually working button does not make a red guard acceptable.

## High-Priority Stabilization Findings

### ERP-008 - Financial screens default outside the active financial year

Trial Balance, GST Register, and Financial Control opened with `01/01/2026-18/07/2026`, while the selected year is FY 2026-27. Selecting `This FY` correctly changes the period to `01/04/2026-31/03/2027`.

**Correction:** Default accounting, GST, and control reports to the selected financial year or clearly label an intentional cross-year period. Add a cross-screen period-consistency verification.

### ERP-009 - Master data is assigned to the wrong entity types

The Departments master includes employees, people, suppliers, and companies such as `ANKIT KUMAR`, `ASIAN PAINTS LIMITED`, `COMSHIP INFRA`, and `Gesture India Security Services Pvt Ltd`. The Stock Inward supplier selector includes ledger-like values such as `Cash` and `Cgst @6%`.

**Correction:** Create a governed master-data cleanup programme with preview, classification, merge/move rules, references check, audit log, and rollback. Do not delete contaminated records directly.

### ERP-010 - Encoded and misspelled master labels are exposed

Examples include `Medium&#10;Enterprises`, `Chief Enginner`, `Instute`, `MANAGMENT`, `DEPARMENT`, `COPROATION`, `ENGNEERING`, and `Seceratary`.

**Correction:** Decode imported display text on ingestion and run a reviewed deduplication/normalization batch. Preserve original imported values in audit evidence.

### ERP-011 - Compact Utilities mode is not usable

The compact rail shows clipped fragments (`Produ...`, `CURR SCRE...`, `Fina... Rep...`), cut-off shortcuts, nested scrolling, and a horizontal scrollbar instead of stable icons with tooltips.

**Correction:** Implement a true fixed-width icon rail. Hide expanded text/content entirely in compact mode, keep icon hit targets stable, and provide accessible names/tooltips.

### ERP-012 - Global Search coverage and ranking are incomplete

`Business Voucher` and `Sales Register` return no matching ERP screen, although those concepts are present elsewhere. `Profitability` ranks Dashboard ahead of dedicated profitability screens. Default supplier results are not alphabetized.

**Source confirmation:** `src/renderer/App.jsx:1591-1606` filters and slices source order without a normalized rank/sort stage.

**Correction:** Build results from the canonical route/title registry, add aliases, rank exact screen matches first, separate entity records from screens, and use natural alphabetical ordering within equal-ranked groups.

## Medium-Priority Corrections

| ID | Finding | Recommended correction |
|---|---|---|
| ERP-013 | Dashboard shows `CompanyGESTURE...` without spacing and says no additional widgets are available while widgets are present. | Correct label composition and make widget-empty messaging conditional on the actual addable-widget set. |
| ERP-014 | Current Company text is repeatedly clipped in the Utilities panel. | Provide a readable selected-company treatment with tooltip and stable responsive width. |
| ERP-015 | Report titles such as Trial Balance and GST Register wrap into narrow multi-line toolbar blocks; some right-side actions approach clipping. | Rebalance toolbar grid tracks and keep title/action regions independently responsive. |
| ERP-016 | GST Register says `run seed data`, and Payables says `Create Phase 2 transaction records`. | Replace internal/test language with task-oriented user guidance and direct navigation. |
| ERP-017 | Payables presents `Manual Entry` as a selected mode but shows no manual entry form. | Remove/disable the mode or implement the approved workflow; explain whether payables are generated from posted bills. |
| ERP-018 | Stock Inward has no warehouse option beyond `Select`, blocking normal entry in the audited data set. | Add a clear `No warehouses configured` state with a governed link to Warehouse Masters. |
| ERP-019 | Supply Order defaults to `Received` before item entry and shows F3-F8 actions without an active order. | Review lifecycle default and disable/contextualize shortcuts until prerequisites are satisfied. |
| ERP-020 | Supply Order guidance displays `Draft allowedThis order...` without spacing. | Correct message composition and add UI text snapshot coverage. |
| ERP-021 | Receipt Voucher content is pushed far below repeated dashboard/intelligence panels, while Productivity says `Voucher Dashboard`. | Separate voucher entry from dashboard summaries or collapse secondary panels; align context title with the active voucher route. |
| ERP-022 | Pressing Escape to close a voucher picker also primes `Press Esc again to go back`. | Stop event propagation after the picker handles Escape and reset the double-Escape timer. |
| ERP-023 | Financial Reports provides direct buttons only for Day Book, Trial Balance, and General Ledger. | Add governed open actions for every listed report or explain unavailable reports consistently. |
| ERP-024 | GST Summary shows `Current Period` without visible date boundaries. | Display exact from/to dates and active financial year beside the period label. |
| ERP-025 | Profitability describes GST Impact as `Gross margin x GST rate`. | Obtain accounting review; GST is generally transaction-tax impact, not a margin multiplication. Avoid certifying this wording without evidence. |
| ERP-026 | Help Assistant layout is crowded, with clipped descriptions, dense suggestion buttons, and duplicate navigation/actions. | Simplify the ordinary-user surface after correctness is fixed; keep one clear question flow and move diagnostics behind an admin-only view. |

## Alphabetical-Order Result

The new shared option-sorting utility passes its direct verifier (**8 passed / 0 failed**), and representative Department, Item, Supplier, and Bank pickers showed natural alphabetical ordering in Electron. However, universal compliance is not achieved because Global Search entity results retain source order rather than alphabetical/ranked order, and contaminated master data still makes correctly sorted lists misleading.

The verifier currently has no registered npm script. `npm run verify:alphabetical-option-order` fails with `Missing script`; the direct command `node scripts/verify-alphabetical-option-order.js` passes.

## Verification and Runtime Evidence

| Check | Result |
|---|---|
| `npm run lint:syntax` | PASS |
| `npm run build` | PASS - 247 modules transformed |
| `node scripts/verify-alphabetical-option-order.js` | PASS - 8/8 |
| `npm run verify:screen-actions` | **FAIL - 0/3** |
| `npm run verify:safe-delete` | **FAIL - 6/23, 17 failures** |
| `git diff --check` | **FAIL - trailing whitespace in `App.jsx` and `layout.css`** |
| Electron stderr | Empty in the clean audit session |
| Electron stdout | No fatal renderer exception; one deprecated `console-message` listener warning |

The build being green does not override the live blank route, failed safety checks, or wrong Help Assistant answer.

## Working-Tree Assessment

The branch points at the release-candidate commit and tag, but the working tree is substantially dirty: 29 tracked files have changes, and multiple architecture documents, reports, scripts, help components, workflow modules, and sorting utilities are untracked. The current state is not a clean certification baseline.

The broad changes include UX wiring, help relocation, searchable-option work, workflow enforcement foundations, documentation, Vite settings, main-process deletion behavior, and renderer screens. These scopes must be separated, audited, verified, and committed intentionally. No further tag or release package should be created from this mixed worktree.

## Recommended Correction Sequence

1. Freeze feature work and preserve the dirty tree as a recovery patch/branch without calling it certified.
2. Restore Billing Voucher route rendering and complete a focused billing Electron smoke test.
3. Revert or formally correct the unverified master-delete bypass; make `verify:safe-delete` pass.
4. Correct Help Assistant submission, location relevance, and terminology leakage; add live interaction coverage.
5. Make the Electron dev launcher deterministic and enforce a single app instance.
6. Reconcile and pass `verify:screen-actions`; register and run the alphabetical verifier through npm.
7. Standardize active-financial-year defaults across accounting, GST, and control reports.
8. Stabilize compact Utilities, Global Search, and responsive toolbar behavior.
9. Run a controlled master-data cleansing audit with no direct destructive cleanup.
10. Re-run the full verification baseline and repeat Electron smoke testing before any lock or release decision.

## Limitations

This was a representative cross-ERP smoke audit, not exhaustive UAT of every route or every role. Mutation-sensitive operations were intentionally not executed. Print, export, PDF generation, posting, reversal, import, restore, approval, and destructive actions require separate controlled tests with disposable data and rollback evidence.

## Architecture Gate Decision

**BLOCKED - fix listed blockers first.**

Billing is visibly unavailable, Help Assistant navigation guidance is incorrect and leaks internal architecture terms, safe-delete verification fails, the screen-action guard is red, and the working tree is not a clean baseline. Only stabilization and corrective work are permitted under the Programme Stabilization and Certification Law.
