# FSR-1 Trial Balance Reconciliation Report

**Audit date:** 2026-07-20  
**Overall result:** FAIL  
**Arithmetic equality for controlled fixture:** PASS

## Current calculation

`src/main/database/reportBuilders.js::trialBalance` selects active accounts for one company and left-joins `ledger_entries` for the selected date range. It returns raw debit movement, credit movement and a normal-side `balance`, with `accounts.opening_balance` added to the matching side.

It does not calculate opening debit/credit from prior posted activity, separate opening from movement, produce closing debit/credit columns, aggregate groups, select a financial-year contract, or filter by voucher posting/cancellation status.

## Independent fixture comparison

The verifier created a temporary company, an April-March financial year, 35 classified ledgers, one voucher-backed opening balance, and 33 balanced transactions. Expected figures were accumulated from the fixture transaction definitions independently of report code.

| Measure | Independent expected | ERP output | Result |
|---|---:|---:|---|
| Total debit movement | 255,656.00 | 255,656.00 | PASS |
| Total credit movement | 255,656.00 | 255,656.00 | PASS |
| Difference | 0.00 | 0.00 | PASS |
| Voucher-line to ledger variance | 0.00 | 0.00 | PASS |
| Per-day debit-credit variance | 0.00 | 0.00 | PASS |

## Required capability matrix

| Requirement | Result | Evidence |
|---|---|---|
| Account group | FAIL | No governed group registry; renderer-only heuristic |
| Ledger | PASS | One row per active account |
| Opening debit/credit | FAIL | Only static account opening is merged into movement |
| Period debit/credit movement | PASS | Raw date-range sums are present |
| Closing debit/credit | FAIL | One `balance` field, not closing-side columns |
| Net/gross presentation | FAIL | No governed option |
| Selected period | PASS | `date_from`/`date_to` apply |
| Selected company | FAIL safety gate | Account is scoped, but joined ledger company is not constrained |
| Selected financial year | FAIL | No FY parameter/validation in report query |
| Previous-year continuity | FAIL | Executable year-close probe failed |
| Opening differences visible | FAIL | Suspense and direct opening balances blend into totals |
| Draft/cancelled exclusion | FAIL | Synthetic Draft/Cancelled ledger effects changed report income by 333.00 |
| Ledger equals voucher postings | PASS for controlled paths | Fixture had zero variance |
| Group equals child ledgers | FAIL | No backend aggregation contract |
| Drill-down to ledger/voucher | PASS | Account drill-down retained voucher IDs/numbers |
| Zero-balance include/exclude | FAIL | All active accounts always returned |
| Historical inactive ledgers | FAIL | Soft-deleted/inactive history is excluded with no history mode |
| Closing stock not duplicated | PASS in fixture | One Inventory row and one COGS row |

## Critical variance probes

### Company isolation

A Company B voucher was deliberately posted with Company A account IDs through exported `createBalancedVoucher`. Company A Bank debit then increased by 777.00 because Trial Balance joins on account ID but does not require `le.company_id = a.company_id`. The database permits this relationship and the internal posting function does not validate account ownership.

### Voucher state

Balanced ledger lines linked to Draft and Cancelled vouchers were inserted into the isolated database. Core statement totals included both because Trial Balance/P&L/Balance Sheet do not join the voucher header to enforce status policy.

### Opening balance bypass

`createOpeningBalance` is balanced and voucher-backed, but `createLedgerAccount` also accepts a direct `opening_balance`. Trial Balance adds that value without an offsetting entry. A user-created direct opening can therefore make Trial Balance unequal.

**FSR-2A.5A correction**: `createLedgerAccount` now forces `opening_balance = 0`.
`accounts` is in `WRITE_POLICY.accountingReadOnly`. The Trial Balance COALESCE
prefers `carry_forward_entries` over `a.opening_balance`, making the field
**non-authoritative**. FSR-R08 CLOSED.

## Decision

The report is a valid basic movement listing over clean ledger data, but it is not a certified Trial Balance contract. It must not be used as proof that statement classification, inventory, year-end continuity or company isolation is correct.

**Remediation priority:** CRITICAL in FSR-2A  
**Safe to redesign presentation first:** No

