# FSR-2A Electron Desktop Smoke-Test Report

**Date:** 2026-07-24
**Tester:** Codex independent verification
**Application commit:** `ec197bebb7b2c6ad86801bc67060e4638c2eeace` plus uncommitted stabilization corrections
**Environment:** Windows desktop, Electron development runtime
**Database:** Disposable SQLite root `runtime/fsr2a-lock-smoke-20260724`
**Result:** PASS

## Launch And Session

| Test | Result | Evidence |
|---|---|---|
| Application starts | PASS | Electron window opened without fatal main-process or renderer error |
| Login/session | PASS | Authenticated session reached Dashboard |
| Dashboard/sidebar | PASS | Dashboard and navigation rendered |
| Company context | PASS | Gesture India Infrastructure remained visible and selected |
| Financial-year selection | PASS | Switched to FY 2025-26 and restored FY 2026-27 |
| Restart and reuse | PASS | Same disposable database reopened and retained posted evidence |
| Normal close | PASS | Window closed; no GII GeM ERP process window remained |

The disposable seed contained one company. The company control loaded and
retained that company; multi-company isolation was separately exercised by the
populated automated verifiers.

## Accounting And Inventory Screens

| Screen or action | Result | Observed evidence |
|---|---|---|
| Chart of Accounts | PASS | 29 accounts and correct Indian currency display |
| Advanced Journal | PASS | Manual voucher form opened |
| Invalid voucher | PASS | Debit 100.25 / credit 100.24 showed difference 0.01 and posting was rejected |
| Valid voucher | PASS | Debit 100.25 / credit 100.25 posted and form reset |
| Stock Inward | PASS | Screen opened with two posted fixture records |
| Inventory pickers | PASS | Search and selection controls worked |
| Approved Supplier Quick Create | PASS | Created supplier displayed by name, not internal identifier |
| Supply Order Quick Create denial | PASS | Nonexistent supply order offered no unauthorized Quick Create |

## Financial Reports

| Test | Result | Observed evidence |
|---|---|---|
| Trial Balance | PASS | Full year Dr 28,77,600.25 = Cr 28,77,600.25; difference 0.00 |
| Trial Balance period | PASS | This Month changed totals to 100.25 / 100.25 |
| Ledger drill-down | PASS | Cash ledger showed the posted journal line |
| Voucher drill-down | PASS | `JOURNAL-00004` opened with Cash Dr 100.25 and Bank Cr 100.25 |
| Profit and Loss | PASS | Income 10,00,000; expenses 7,18,000; net profit 2,82,000 |
| Profit and Loss period | PASS | This Month updated to 0 |
| Balance Sheet | PASS | Assets 9,91,500 = liabilities plus equity 9,91,500; difference 0 |
| Negative/contra display | PASS | Bank displayed -50,100.25 correctly |
| Paise scaling | PASS | No amount appeared multiplied or divided by 100 |

## Database Evidence

Read-only inspection after restart showed:

- `PRAGMA integrity_check` returned `ok`;
- `JOURNAL-00004` remained Posted in financial year 2;
- voucher debit minor and credit minor each equalled 10,025;
- Cash carried debit minor 10,025 and Bank carried credit minor 10,025; and
- Quick Create supplier records remained active.

## Console And Runtime

No fatal React render, missing module, failed import, route, database, or
main-process error appeared. The only warning was Electron's development
Content Security Policy warning about `unsafe-eval`; it did not affect the
tested workflow.

Live Electron window state and process output were reviewed. No governed
screenshot artifact was persisted.

## Production Boundary

This test used a disposable development database. It did not package, install,
upgrade, restore, or migrate a production executable or production database.
Production release remains BLOCKED by RMD-1 and historical-data controls.
