# Area: architecture — renderer architecture, AI/knowledge layer, governance and verification suite (acf6d02)

## 1. Scope covered

Files read (main ones):
- AGENTS.md
- src/renderer/App.jsx (1683 lines)
- src/renderer/config/{navigation.js, screenRegistry.jsx, storageKeys.js}
- src/renderer/utils/errorGuidance.js
- src/renderer/modules/{helpAssistant, erpAssistant, erpBrain/loaders, quick-create}
- src/renderer/knowledge/*.json (metadata and structure)
- src/renderer/features/billing/billingHelpers.js and features/accounting/businessVouchers/businessVoucherUtils.js
- src/renderer/features/importExport/TallyMasterMigrationAssistantScreen.jsx (company preselect)
- src/renderer/screens/MasterDataTools, EnvironmentManager (All-Companies handling)
- src/main/services/billingService.js
- scripts/verify-erp.js, scripts/lib/masterVerificationPolicy.js, scripts/verify-governance-graph-registry.js, scripts/verify-database-graph.js, scripts/verify-alphabetical-option-order.js
- docs/architecture/report-evidence-disposition-manifest.json, reports/phase-ggr-1-governance-graph-reconciliation-report.md, docs/audit/erp-current-state-audit-2026-08-21/*

What I ran (scripts and logs are in /tmp/claude-0/aud-work/architecture/):
- All 19 node-only verify scripts listed in the scope, plus verify:financial-reports and verify:fsr2a1..2a5c. The logs are in verify/*.log.
- `npm run lint:syntax` and `npm run build`. The logs are verify/lint.log and verify/build.log.
- routes.mjs: a static check of every navigation and title key against what App.jsx actually renders, plus every assistant or knowledge view reference.
- dbgraph.mjs: compares the DG-1 database-graph.json against the real schema of a fresh `initializeDatabase()` database.
- billing-trust.mjs: a repro of `saveBillingVoucher` on a throwaway database.
- gate.mjs: a repro of the master lock-gate policy.
- ff.mjs: a repro of the ERP assistant's related-screen output.

Side effects in /tmp/claude-0/aud (please note):
- `npm run verify:erp` runs `npm run build`, which rewrote `dist/`. That is allowed.
- verify:erp also **created `reports/verify-erp-report.md`** (8,964 bytes) in the read-only copy. My attempt to move it out was blocked by the permission classifier, so the file is still there. A copy of it is in my work folder. Delete `/tmp/claude-0/aud/reports/verify-erp-report.md` if a pristine copy matters; it did not exist before.

## 2. Findings table

| id | sev | status | file:line | defect | impact |
|---|---|---|---|---|---|
| ARCH-1 | P1 | REPRODUCED | scripts/verify-governance-graph-registry.js:287-303; docs/architecture/report-evidence-disposition-manifest.json; .gitignore `reports/*` | The GGR-1 check pins SHA-256 and byte sizes for 316 `reports/` files. 312 of them are git-ignored and absent from any checkout, and 16 must never be committed. The manifest also pins `reports/verify-erp-report.md`, a file that verify:erp regenerates on every run. | `verify:audit`, `verify:graph-registry` and `verify:erp` fail on every clean clone. They also fail on the author's machine after one run of verify:erp. verify:erp stops at step 6 (verify:audit), so its accounting and financial checks never run. This is the "historical-report checksum discrepancy". |
| ARCH-2 | P2 | REPRODUCED | scripts/verify-erp.js:57-90,175-200; scripts/lib/masterVerificationPolicy.js:1-43 | The master runner treats exit 1 as a "WARNING" for every step. Exit 1 is how verify:safe-delete, fk-constraints, production-readiness-sql, workflow-enforcement, entity-picker and operational-stages report real failures. These steps are not in LOCK_BLOCKING_STEPS. | Failing data-integrity checks still give "PASS WITH WARNINGS", process exit 0, Safe to Commit = Yes, and even Safe to Lock = true. |
| ARCH-3 | P2 | REPRODUCED | src/main/services/billingService.js:7-35,273-366; renderer math in src/renderer/features/billing/billingHelpers.js:3-24 | `billing:save` stores the renderer's taxable_value, gst_amount, cgst, sgst, igst and gross_value as sent. It never recomputes or cross-checks them, and it accepts posting_status and approval_status from the payload. GST math is owned by the renderer (rule 7). | Invoice lines can be stored with impossible GST (18% of 1000 stored as 1; CGST 500, SGST 0.5, gross 5) and marked Posted/Approved with no voucher. This widens known defect "createRecord trusts Posted/Approved" to billing:save. |
| ARCH-4 | P2 | REPRODUCED | src/renderer/modules/erpAssistant/sources/knowledgeBridge.js:123; ui/AssistantAnswerCard.jsx:38-41; knowledge/feature-function-graph.json featureNodes | The ERP Assistant's "Related screens" buttons call `onNavigate(screenRef)` with PascalCase names such as "TrialBalance" or "GoodsReceipt", which are not route keys. In addition, 29 of the 50 FF-1 `viewKey`s are not real routes. | Clicking a related screen in the assistant opens a blank workspace. The breadcrumb falls back to "Dashboard" and the bogus key is added to recents. |
| ARCH-5 | P2 | REPRODUCED | src/renderer/knowledge/database-graph.json; scripts/verify-database-graph.js (no schema comparison) | DG-1 is hand-written and stale. All 73 table names match, but 54 of 73 tables are missing real columns. The missing columns include every `*_minor` money column, `vouchers.approval_status/reversed_by/is_deleted` and `audit_log.event_hash`, and 2 column types are wrong. verify:database-graph only checks the graph against itself. | The assistant presents DG-1 as "ERP data model" guidance, so its schema answers are wrong. verify:database-graph's "32 pass" gives false assurance. |
| ARCH-6 | P3 | CODE-TRACED | src/renderer/App.jsx:446-470 | `navigate()` accepts any string and has no fallback for unknown views. App.jsx:1323-1390 renders nothing for an unmatched key. | This is the root cause of ARCH-4 and ARCH-7: a blank screen instead of a guided error (rules 10 and 13). |
| ARCH-7 | P3 | CODE-TRACED (static route scan) | src/renderer/config/navigation.js:16,230; App.jsx render chain 1323-1390 | The sidebar item `profit_simulator` has no render branch in App.jsx; its only branch is in the unused screenRegistry.jsx:73. This was self-reported in docs/audit/erp-current-state-audit-2026-08-21 (#10) and is still open. | Profitability > Profit Simulator opens a blank screen. |
| ARCH-8 | P3 | CODE-TRACED | src/renderer/config/screenRegistry.jsx (117 lines, never imported) | A dead, diverged duplicate of App's screen chain. Examples: voucher_dashboard goes to BillingVoucherScreen here but to BusinessVoucherScreen in App, and many `api=` props are missing. | Anyone who "modularizes" by switching App to resolveScreen would silently change screens. It is also misleading for the knowledge graphs, which cite it. |
| ARCH-9 | P3 | CODE-TRACED | src/renderer/App.jsx:97-279 vs src/renderer/utils/errorGuidance.js:1-183 | App.jsx carries its own diverged copy of the error-guidance utilities. TransactionScreen uses the utils copy, while toasts use the App copy. | Two sources of truth for user-facing error guidance (rules 2 and 5). |
| ARCH-10 | P3 | CODE-TRACED | src/renderer/App.jsx:369-380 | On load, or when the stored company is no longer active, the first active company is selected and persisted silently with no notice. | Rule 9 says "no silent fallback to first company". The selector does show the company, so risk is low. |
| ARCH-11 | P3 | CODE-TRACED | src/renderer/features/importExport/TallyMasterMigrationAssistantScreen.jsx:505-509 | After preview, the target company is pre-set to the company name-matched from the Tally file, ahead of the user's current company context. | Imports can default to a different company than the one shown in the header. The user must notice the change (rule 9: imports map to the selected company). |
| ARCH-12 | P3 | REPRODUCED | scripts/verify-alphabetical-option-order.js:58 | This is a source-string check for `return sortOptions(map[type] || [])` in TransactionScreen. That code was removed in 0737a61 (SmartEntityPicker), so the check is stale and fails. The script is not in the verify:erp pipeline. | A red test that nobody runs. |
| ARCH-13 | P3 | REPRODUCED | vite.config.js `chunkSizeWarningLimit: 3000`; package.json lint:syntax | Build output is one 2.35 MB JS chunk (531 kB gzip), and the warning is suppressed by the raised limit. Of that, about 1.39 MB is bundled knowledge JSON. lint:syntax runs `node --check` on 44 files: 10 of the 46 main/preload files and no renderer files. There is no ESLint. | Slower startup. "lint passed" means much less than the governance documents imply. |

Counts: P0 0, P1 1, P2 4, P3 8.

## 3. Details and repro output

### ARCH-1 Historical-report checksum discrepancy (P1, REPRODUCED)
- acf6d02 ("Reconcile architecture governance and graph registry lifecycle") added `docs/architecture/report-evidence-disposition-manifest.json`. It has 316 entries, each with sha256 and bytes, taken from `git ls-files --others --ignored --exclude-standard -- reports` on the author's machine (baselineCommit 1ec42d1).
- The same commit added the check at scripts/verify-governance-graph-registry.js:298-303: every entry must exist with the same size and SHA-256. verify-audit.js:27 imports this check, so verify:audit fails too, and verify:erp runs verify:audit as step 6.
- `.gitignore` keeps `reports/*` ignored. Only 13 report files are tracked at acf6d02. The GGR-1 report itself (line 110) says 16 PRIVATE_SOURCE_DERIVED reports "must not be committed unredacted".
- Repro on /tmp/claude-0/aud:
  - Missing: 312.
  - Matching: 3. These are the governance-evidence files, whose hashes CB11ED4C…, 079381AA… and 85AF7660… match both the manifest and the GGR-1 report.
  - Mismatching: 1, `reports/verify-erp-report.md`, with 8,964 bytes on disk against 56,530 pinned. The manifest itself labels it `MUTABLE_GENERATED_OUTPUT`.
  - `verify:graph-registry`: `FAIL Report manifest integrity mismatch: reports/accounting-control-implementation-report.md, …` → `PASS: 47 INFO: 1 FAIL: 1`, exit 2.
  - `verify:audit`: `PASS 291, INFO 4, FAIL 1`, exit 2. The FAIL is GGR-1.
  - `verify:erp`: `→ exit 2 (FAIL)` at verify:audit, then `⛔ STOP: verify:audit returned FAIL. Halting pipeline.`, then `Final: FAIL / Safe to Commit: No / Safe to Lock: No`. Steps 7 onward (accounting, financials, controls, …) never run.
- Self-invalidation: scripts/verify-erp.js:26 writes `reports/verify-erp-report.md` with a timestamp at the end of every run, including failed runs. After one verify:erp run on the author's machine, the pinned hash no longer matches, so every later verify:audit or verify:erp fails. `scripts/desktop-functional-stabilization.js` similarly rewrites the pinned `reports/desktop-functional-stabilization-results.json`.
- Two smaller issues:
  - `isGitIgnored` and `isGitTracked` (lines 83-99) quietly return false outside a git work tree. In a non-git copy, the check "All three governance-evidence reports are allowlisted" therefore passes without testing anything.
  - fsr-2a-full-verification-matrix.md:57 records verify:erp as "PASS WITH WARNINGS". That predates this check and cannot be reproduced at acf6d02.
- Fix direction: drop the per-file hash check for ignored files, or make it opt-in with an env flag and skip missing files. Never pin hashes of generated outputs.

### ARCH-2 Master runner downgrades real failures (P2, REPRODUCED)
- verify-erp.js uses `continueOn: [0, 1]` for every step. Exit 1 is labelled WARNING, the final result is "PASS WITH WARNINGS" with processExit 0, and safeToCommit = `finalExit <= WARNING`.
- evaluateMasterLockGate counts exit 1 only for LOCK_BLOCKING_STEPS. The following steps are not in that set, yet each uses `process.exit(failed > 0 ? 1 : 0)` for genuine failures: verify:safe-delete, verify:fk-constraints, verify:production-readiness-sql, verify:workflow-enforcement, verify:entity-picker, verify:operational-stages, verify:knowledge, verify:workflow-graph and verify:database-graph.
- Repro (gate.mjs): all blocking steps pass, and the six steps above exit 1. The result is `{ safeToLock: true, workingTreeClean: true, missingBlockingSteps: [], functionalFailures: [], blockingFailures: [] }`.
- verify:financial-reports is accepted only if exactly "FAIL: 9" and "FAIL: 16" remain (verify-erp.js:34-55). Known failures are baked into the pass criterion; this is self-reported as known gap #2.

### ARCH-3 billing:save trusts renderer GST, totals and statuses (P2, REPRODUCED)
billing-trust.mjs on a fresh initializeDatabase() (seeded company 1, order 1, FY 2025-04-01) called:
```
saveBillingVoucher(db, { header:{order_id, invoice_date, posting_status:"Posted", approval_status:"Approved"},
  items:[{quantity:10,billing_rate:100,gst_rate:18,taxable_value:1000,gst_amount:1,cgst:500,sgst:0,gross_value:5}] })
→ invoice { id: 2, billing_value: 1000, posting_status: 'Posted', approval_status: 'Approved' }
→ line { quantity:10, billing_rate:100, gst_rate:18, taxable_value:1000, cgst:500, sgst:0.5, igst:0, gst_amount:1, gross_value:5 }
```
- billingService.js:10-16 uses caller values whenever they are truthy. `sgst: 0` is falsy, so it fell back to gst_amount/2 = 0.5.
- The renderer is the only place GST is computed (billingHelpers.js:8, unrounded float). This conflicts with rule 7, which says GST rules must live in services.
- Posting and approval statuses come straight from the payload (lines 320-323), which is reachable via IPC `billing:save` (main.js:728).
- Company: `header.company_id` is used without checking that it equals `order.company_id` (line 282), with a first-company fallback. This relates to self-reported #6.
- Whether the posting step later re-derives GST from invoice_items is for the billing/GST reviewer to confirm.

### ARCH-4 Assistant related-screen links go to non-routes (P2, REPRODUCED)
```
"where is the trial balance" -> ["TrialBalance"]
"explain goods receipt"      -> ["GoodsReceipt"]
```
- These come from `resolveQuery()` in knowledgeBridge.js. AssistantAnswerCard.jsx:41 renders `<button onClick={() => onNavigate(s)}>` with these values, and HelpAssistant.jsx:95 passes App's `navigate`.
- App.jsx:446 calls `setView("TrialBalance")`. No branch matches, so the workspace is blank.
- routes.mjs found that 29 FF-1 viewKeys are not routes: masters, company_selector, purchase_order, procurement_planning, supplier_purchase_order, goods_receipt, inventory_reservation, delivery_challan, installation, crac, sales_invoices, bill_history, receipts, expenses, business_voucher, accounting_voucher, opening_balance, ledger_report, cash_bank_book, tds_reports, inventory_valuation, profitability_analysis, tally_import, tally_master_migration, spreadsheet_import, spreadsheet_export, assistant_panel, backup_restore and financial_year_lock.
- No verify script checks that assistant navigation targets resolve. verify:feature-function-graph reports 31/31 pass.

### ARCH-5 DG-1 database graph is stale against the real schema (P2, REPRODUCED)
dbgraph.mjs output: `real tables 73, graph tables 73; tables compared 73, exact column match 19, with diffs 54`. Ten spot-checks:

| table | finding |
|---|---|
| vouchers | missing updated_at, deleted_at, deleted_by, is_deleted, reversed_by, approval_status |
| voucher_lines | missing debit_minor, credit_minor, is_deleted, … |
| ledger_entries | missing debit_minor, credit_minor, running_balance_minor, is_deleted, … |
| accounts | missing opening_balance_minor |
| audit_log | missing user_role, module, event_hash |
| stock_ledger | 13 of 32 columns; missing quantity_in/out, running_quantity/value, value_minor, voucher_id, … |
| financial_years | missing closed/locked/reopened columns |
| items | type mismatch: warranty_period (graph TEXT, DB INTEGER), import_batch_id (graph INTEGER, DB TEXT) |
| users | missing recovery_secret_hash, recovery_failed_attempts, recovery_locked_until |
| payment_allocations / supplier_payment_allocations | missing deleted_by |

- No graph column is absent from the database; the graph is a stale subset.
- Generators exist only for renderer-graph (scripts/build-renderer-graph.js) and manual-graph (scripts/build-manual-graph.js). database-graph, workflow-graph, voucher-accounting-graph, feature-function-graph and audit-graph are hand-maintained JSON with fixed generatedAt dates (2026-07-14 to 2026-08-11).
- verify-database-graph.js checks only JSON-schema validity, internal consistency, registry status and a few hard-coded table names. It never opens schemaDefinitions.js or a database.

### ARCH-6 / ARCH-7 / ARCH-8 Routing
- Static route scan (routes.mjs): there are 165 sidebar keys and 175 viewTitles keys. After routeAliases, every key resolves to an App.jsx render branch **except `profit_simulator`**.
- Section items and group.items are consistent; no key appears in a section without appearing in group items.
- Three sidebar keys have no viewTitles entry: procurements, expense_entries and payments. They fall back to transactionViews titles, so this is fine.
- screenRegistry.jsx exports resolveScreen, but nothing imports it. The only grep hit for "resolveScreen" is a different function name in contextualBrainHelp.js.

### ARCH-9 to ARCH-13
- ARCH-9: `diff` of sorted lines shows App's copy has extra fields and different `add()` calls compared with utils/errorGuidance.js.
- ARCH-12: `FAIL: Transaction reference options use shared sorting` gives `{passed: 9, failed: 1}`, exit 1. `git log -S` shows the string was removed in 0737a61.
- ARCH-13 build output:
  ```
  vite v7.3.5 … ✓ 263 modules transformed.
  dist/index.html 0.78 kB │ gzip 0.49 kB
  dist/assets/index--KzyHBoa.css 113.79 kB │ gzip 20.30 kB
  dist/assets/index-DW-wC0sh.js 2,349.56 kB │ gzip 531.15 kB
  ✓ built in 5.24s
  ```
  - There were no warnings, but only because `chunkSizeWarningLimit: 3000`.
  - The knowledge JSON bundled into the renderer is 1,387,348 bytes. database-graph.json alone is 350 kB.
  - lint:syntax exit 0.

## 4. What looks solid (with evidence)
- **No business math or posting in App.jsx.**
  - App.jsx's only API calls are listRecords, getReferences, getAccountingData, getDashboardCounts, getInventoryData, createBackup, logout, logContextAudit and the close/shortcut listeners.
  - There are no GST, valuation or posting formulas in it. It is a shell plus keyboard handling, global search and error guidance, although it is large at 1683 lines.
  - Voucher-preview math lives in features/accounting/businessVouchers/businessVoucherUtils.js (a utility), which complies with rule 7. It is preview-only, but it is a second copy that can drift from the backend.
- **The AI and assistant layer is read-only and offline.**
  - modules/helpAssistant, erpAssistant, erpBrain, knowledge and components/helpProductivity contain no `api.*`, `apiClient`, `window.giiGemErp`, `ipcRenderer`, `dispatchEvent`, `.click()`, `fetch` or `XMLHttpRequest` calls.
  - Their only side effect is `onNavigate(viewKey)`.
  - Across all of src/, there is no `fetch(`, WebSocket, http/https module, axios, OpenAI/Anthropic SDK, API key or autoUpdater. The only `http://` strings are OOXML namespace URIs in the spreadsheet exporters.
  - verify:read-only-assistant R4-003..006 encode the same rules for erpAssistant.
  - quick-create, the one write path near the assistant, is a user-driven dialog in components/overlays/QuickCreateMasterDialog.jsx with permission and duplicate guards. The assistant does not call it.
- **All Companies View.**
  - It is admin-only (App.jsx:326 `effectiveCompanyScope = adminUser ? companyScope : "single"`).
  - It is read-only through AllCompaniesReadOnlyScreen for all views except a small allow-list.
  - MasterDataTools blocks writes when `company_scope === "all"` or no company_id is set (MasterDataToolsScreen.jsx:112-113).
  - Enforcement is renderer-only; the main process has no notion of scope.
- **Error guidance.** There are no "Something went wrong", "Validation failed" or bare "SQLite error" strings in src/. SqliteError is rewritten to "Database error: …" with field and section guidance for unique constraints (App.jsx/utils errorGuidance).

### Verification suite (item 4)

| script | result | key line | type |
|---|---|---|---|
| verify:knowledge | PASS (0) | per-module "N entries, 0 errors - PASSED" | documents/JSON shape (imports knowledge modules) |
| verify:workflow-graph | PASS (0) | 0 failed | JSON shape and self-consistency |
| verify:database-graph | PASS (0) | Summary: 32 passed, 0 failed | JSON shape only, no schema comparison (ARCH-5) |
| verify:voucher-accounting-graph | PASS (0) | 0 failed | JSON shape |
| verify:erp-brain | PASS (0) | Summary: 51 passed, 0 warnings, 0 failed | file existence and source strings |
| verify:help-assistant-brain | PASS (0) | all ✓ | file existence and source strings |
| verify:read-only-assistant | PASS (0) | R4-003..006 no LLM/write-IPC/DB/HTTP imports | source-string guard (useful) plus report-existence checks |
| verify:feature-function-graph | PASS (0) | FF-1 Verification: 31 passed, 0 failed | JSON shape (misses invalid viewKeys, ARCH-4) |
| verify:assistant-relevance | PASS (0) | Final: PASS | **behaviour**: runs the classifier on a query bank |
| verify:audit | **FAIL (2)** | PASS 291, INFO 4, FAIL 1 (GGR-1 manifest) | mostly document and graph checks |
| verify:graph-registry | **FAIL (2)** | PASS: 47 INFO: 1 FAIL: 1 (manifest integrity) | document/checksum |
| verify:audit-graph | PASS (0) | 27 passed, 0 failed | JSON shape |
| verify:manual-graph | PASS (0) | 0 failed | JSON shape (generator exists) |
| verify:workflow-enforcement | PASS (0) | WF-01..: PASS | mostly source strings; the engine is not imported by the live app (self-reported #7) |
| verify:erp | **FAIL (2)** | ⛔ STOP at verify:audit; Safe to Commit: No | orchestrator (ARCH-1, ARCH-2) |
| verify:screen-actions | PASS (0) | "render marker found", "wired exactly once" | source-string markers |
| verify:master-policy | PASS (0) | 9 PASS | **behaviour**: unit tests of the lock-gate policy |
| verify:alphabetical-options | **FAIL (1)** | passed 9, failed 1 | 4 behavioural sort tests plus 6 stale source-string checks (ARCH-12) |
| verify:entity-picker | PASS (0) | passed 103, failed 0 | mostly source strings (19 file reads, 57 includes/regex) |

- Extra runs: verify:financial-reports and verify:fsr2a1..2a5c are `node` scripts that re-spawn Electron. In this container they die with "Running as root without --no-sandbox is not supported" (exit 1), so they are not runnable here and are not counted.
- Summary: of the 19 scoped scripts, 15 pass and 4 fail (audit, graph-registry, erp, alphabetical-options). Only assistant-relevance, master-policy and part of alphabetical-options exercise runtime behaviour. The rest assert that documents, JSON graphs and source strings exist or agree with themselves. None compares a knowledge graph with the real schema, the real routes or the real IPC surface.

## 5. Not covered
- Electron-based verifiers (verify:accounting, financials, controls, flow, phase10, fsr2b*, safe-delete, fk-constraints, production-readiness-sql, dashboard-wiring): Electron cannot start as root in this container.
- No desktop smoke test was done. The blank-screen findings (ARCH-4, ARCH-6, ARCH-7) are traced through code and the static route scan, not clicked through in Electron.
- voucher-accounting-graph and workflow-graph were not compared against posting code. renderer-graph freshness was not checked by re-running its generator, because it writes into the repo.
- Whether the billing posting step re-derives GST from invoice_items (ARCH-3 downstream) is left to the billing/GST reviewer.
- Main-process IPC permission wrappers are covered by the security area.
