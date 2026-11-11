# Phase 17–18 Report: Security, Posting Integrity, Error Console and Alerts

Branch: `claude/erp-full-automation-qbhv8k` (base `acf6d02`, phase-16-enterprise-crm-integration)
Date: 2026-10-17

## Feature classification

- Primary: Accounting (posting and reversal integrity)
- Secondary: Security, Inventory, Health & Recovery, Operations (alerts), AI Guidance (help assistant)
- Why: the prior audit found the books could be double-posted, mis-reversed and restored from bad files; those are accounting-integrity defects. The user explicitly approved one combined scope ("automate everything", plus error console, reset check and WhatsApp/email alerts), so the phase was not split.

## Dependency assessment

- Modules: accountingService, inventoryService, operationsService, bankReconciliationService, reportBuilders, backup, operationalResetService, deployment services, authService, desktopSessionService, healthService.
- Governance: AGENTS.md v3.1, global UX governance standard.
- Dependencies Satisfied: Yes.

## Commits

| Commit | Scope |
|---|---|
| 15e5553 | Critical-defect test pack (26 tests) and audit evidence |
| a0ad93c | Every IPC call bound to the signed-in session; permission checks without admin fallback; safe reset, restore and rollback |
| 4d1cf49 | Atomic single posting; complete reversal; stock value and opening stock; advances; bank re-booking; balance sheet before year close |
| 0153efa | Number series never reuse numbers; drafts out of day book and party ledger; `test:integrity` script |
| 8928a93 | Error Console, tamper-evident audit chain, help-assistant error guidance, email/WhatsApp alerts |
| cfc916e | Layout fixes from the desktop smoke test |
| 47ad517 | Audit 1 fixes: bank crash and strict "already booked" match, bill before GRN, credit notes bill-wise, receipt and allocation checks, expense formula, audit tail deletion, supplier payments in the posting queue |
| ac05ed0 | Invoice GST computed on the server; upgrade repair migration 036 with automatic pre-upgrade backup; bank proposals restricted to their company; 9 more regression tests |

## Posting-behaviour changes (AGENTS.md rule 4; user may veto any)

1. Reports count vouchers with status Posted **or Reversed**; a reversed original and its reversal both stay in the books, Tally-style.
2. A reversal is dated today (or the original date if that is later), never back into a closed year.
3. Purchase posting debits Goods Received Not Invoiced for value already received through linked stock inwards, and Purchase for the rest.
4. Credit notes post as the mirror of a sale and create no receivable.
5. Money rounds half-up exactly per line (1.005 → 1.01).
6. A receipt allocates to the invoice named on it, else oldest open invoice first; any rest stays unallocated. TDS, GST TDS and other deductions on the receipt post to their own ledgers.
7. Posting an expense posts only that expense (previously all unposted expenses of the order).
8. A bank statement line that matches an already-posted receipt or payment becomes "Already Booked" and cannot create a voucher.
9. Voucher, invoice and document numbers continue from the highest number ever issued in the series.
10. Day book and party ledger exclude Draft vouchers.
11. When the bill is posted before the goods arrive, the later goods receipt credits Purchase instead of Goods Received Not Invoiced; a bill after a GRN clears the GRN value in full and puts any price difference into Purchase.
12. Credit notes now reduce the invoice's bill-wise receivable (shown as "Credit" when negative).
13. A receipt naming an unposted invoice is refused; TDS or other deductions with no open posted invoice are refused; allocations need both documents posted and cannot exceed the deductions recorded.
14. Percentage expenses post the amount from the profitability formula; an expense with no amount is refused with guidance.
15. Supplier payments can be posted from the Posting Queue.
16. Invoice GST is always computed on the server (taxable × rate, rounded; CGST/SGST split evenly or IGST); tax figures sent by the screen are ignored.
17. Business dates use the computer's local date, not UTC.
18. A supplier return clears Goods Received Not Invoiced while the supplier still has unbilled receipts of that item (per item, supplier and order); it reduces Trade Payables only for goods already billed. Before, any posted bill on the order sent every return to Trade Payables.
19. Advances can be adjusted only against a posted, unreversed invoice (customer) or a posted bill (supplier).
20. Credit due dates and warranty expiry are calculated as calendar dates, so they no longer come out a day early in IST.

## Files changed (main)

- Services: `accountingService.js`, `inventoryService.js`, `operationsService.js`, `bankReconciliationService.js`, `backup.js`, `operationalResetService.js`, `authService.js`, `desktopSessionService.js`, `healthService.js`, `deployment/goLiveService.js`, `deployment/rollbackService.js`
- New services: `errorConsoleService.js`, `alerts/alertService.js`, `alerts/smtpClient.js`, `alerts/whatsappClient.js`
- Database: `init.js` (ambient actor, audit chain, series numbering, expense posting, wiring), `reportBuilders.js`, `seedData.js`, `crudHelpers.js`; domain `money.js`
- Main/preload: `main.js`, `preload.cjs`
- Renderer: `HealthCenter/ErrorConsolePanel.jsx` (new), `HealthCenterScreen.jsx`, `features/settings/AlertsSection.jsx` (new), `SettingsScreen.jsx`, `helpAssistant/HelpAssistantRecentErrors.jsx` (new), `HelpAssistant.jsx`, `helpAssistantKnowledge.js`, `config/helpContent.js`, `config/navigation.js` (keywords only), `config/screenRegistry.jsx`, `VoucherProposalScreen.jsx`, `ReadOnlyReportFamilyScreen.jsx`, `RendererErrorBoundary.jsx`, `EnvironmentManagerScreen.jsx`, GoLiveWizard, LoginScreen (removed default-password hint), `browserFallbackApi.js`
- App.jsx: one prop added (`companyContext` to SettingsScreen, GoLiveWizard). No business logic.
- Tests: `scripts/audit/critical-defects.test.mjs`, `posting-regressions.test.mjs`, `alerts.test.mjs`, `ipc-security.test.mjs`, `lib/electron-*.mjs`

## IPC / preload impact

- No channel renamed. Reset/go-live channels now take a payload object `{company_id, confirm_text}` (preload updated in step).
- New channels: `health:error-console`, `health:error-console-record`, `health:error-console-clear`, `alerts:get-settings`, `alerts:save-settings`, `alerts:preview`, `alerts:send-now`.
- New preload methods: `getErrorConsole`, `recordScreenError`, `clearErrorConsole`, `getAlertSettings`, `saveAlertSettings`, `previewAlert`, `sendAlertNow`.

## Route / view key impact

None. Error Console is a tab inside `health_center`; Alerts is a section inside `settings`.

## Database impact

Migration 036 adds soft-delete columns still missing on upgraded databases (approval_queue) and fills paise columns from stored rupee amounts; before it runs on an existing database, a copy is saved to `backups/pre-upgrade-<time>.db`. No new table. `audit_log` rows now store an explicit ISO `created_at` and a chained `event_hash`; the chain start id is recorded as a `schema_migrations` row `audit_chain_started:<id>`. Alert settings live in `<runtime>/config/alerts.json`; passwords/tokens are encrypted with Electron safeStorage. Error journal: `<runtime>/logs/erp-errors.jsonl` (capped at 500).

## Business logic preserved

GST rates and calculation, inventory weighted-average method, profitability formulas and schema unchanged. Posting behaviour changed only as listed above.

## Verification results (Linux container, Node ABI; verify scripts run sequentially against a fresh temp data root)

| Check | Result |
|---|---|
| lint:syntax | pass |
| build (vite) | pass |
| verify-accounting | pass (exit 0) |
| verify-financials | pass |
| verify-controls | pass |
| verify-voucher-workflows-inventory | pass |
| verify-operational-flow | pass |
| verify-phase10-inventory-automation | pass |
| verify-knowledge, help-assistant-brain, screen-actions, assistant-relevance, erp-brain | pass |
| test:integrity: critical defects | 26/26 (was 6/26 at acf6d02) |
| test:integrity: posting regressions + alerts + audit 1 regressions | 20/20 |
| IPC security | 9/9 |

`npm.cmd` Windows runs were not possible in this container; the same scripts were run with Node.

## Desktop smoke test (Electron 37 under xvfb, fresh data root)

Login with first-login password change, dashboard, sidebar search, ERP Health Center > Error Console (6 integrity checks, all pass), a deliberately failed reversal appeared in Recent errors with area, screen and next step, Settings > Alerts preview (pending dues, overdue, payables, stock, low stock), Balance Sheet (assets = liabilities + equity), Help Assistant with "What went wrong recently", back to Dashboard. No console errors, no crash panel. Not tested: real SMTP/WhatsApp delivery (no credentials), Windows packaged build, print.

## Production readiness

- Classification: **Internal Testing**.
- Gates: implementation done; verification passed; desktop smoke done (Linux); git commits done; no tag (not a locked baseline); documentation updated (help content, this report); UAT on Windows with real books not done.
- Known limitations: no CGST/SGST/IGST split in the ledger; alerts not tested against live SMTP/WhatsApp; audit chain covers rows written after this build only; `init.js` remains a large wiring hub; verify scripts open the configured data root unless `GII_GEM_ERP_DATA_ROOT` is set.
- Safe to lock: **No** — pending the two audits in `/mnt/project-files/audits/2026-10-17-erp-automation/` and Windows UAT.

## Lock note

Stable: posting/reversal integrity, session security, restore validation, company-scoped reset, error console, alerts settings. Out of scope: GST split, e-invoicing, multi-user network mode. Any change to posting math needs a separate phase with the user's approval.


## 2026-10-22 in-house audits (Codex unavailable; review policy for a major change)

PR #4 is a major change, so it got three in-house audits: correctness, security, and architecture/long-term sustainability. The reports are in `/mnt/project-files/audits/2026-10-22-pr4-inhouse/`.

Fixed in commit 6fa5734:
- **Correctness:** F1 to F9. Covers go-live and reset rollback, go-live history, the readiness company payload, advance guards, supplier-return GRNI, cross-company links, reservation release, and the input-credit readiness check.
- **Security:** F1 (bank details are admin-only and audit-logged), F3 (navigation and new-window guard only; CSP is still open), F4, F6, F7, F10, F11 and F12.
- **Architecture:** IST date off-by-one; the wizard now sends the text the person typed.
- **Tests:** test:integrity is 76 + 16, all passing. The 7 verify scripts and the Electron smoke test pass.

Still open:
- Security F2 (Electron 37.0.0 is end-of-life; the upgrade is a package change and needs the user's OK).
- Security F3 (CSP).
- Security F5 (keyed audit chain).
- Security F8 (role checks on reads; per-company user grants).
- Security F9 (error-journal flooding).
- Security F13 (lockout of admin).
- Architecture: REAL money, GST in 6+ places, init.js size, click-only same-disk backups, the shipped build-machine database, reset rollback restoring the whole file, no CI.
- Migration 036 approval to be recorded.
- Supplier and company creation by data-entry users may still include bank details. Only changes to existing ones are admin-only.
