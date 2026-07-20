# FSR-1 Accounting Source-of-Truth Map

**Audit date:** 2026-07-20  
**Decision:** `ledger_entries` is the current report calculation source, but it is not yet a certified enterprise accounting source of truth.

## Current authority chain

| Layer | Table/function | Authority | Control status |
|---|---|---|---|
| Business document | invoices, procurements, payments, expenses, guided vouchers, stock documents | Operational facts | Source-specific controls |
| Voucher header | `vouchers` | Posting identity, date, type, status, source | Company and FY fields exist |
| Journal lines | `voucher_lines` | Debit/credit document evidence | Created transactionally |
| General ledger | `ledger_entries` | **Direct statement calculation input** | Mirrors lines; no DB equality constraint |
| Inventory subledger | `stock_ledger` | Quantity and stock-value evidence | Not fully bridged to GL |
| Core reports | `reportBuilders.js` | Query/aggregation layer | Flat account-type calculations |
| UI | `AccountingScreen.jsx`, `ReadOnlyReportFamilyScreen.jsx` | Presentation only in principle | Adds heuristic financial groups in renderer |

## Governing determination

The intended accounting source of truth should be:

```text
Posted, approved, company-scoped voucher lines
  -> immutable ledger entries
  -> governed account and statement mappings
  -> financial statement engine
```

At present, statement queries read `ledger_entries` without consistently revalidating the governing voucher state. `voucher_lines` and `ledger_entries` are also separate persisted amounts with no database constraint proving equality after every possible maintenance path. FSR-1 therefore records:

- **Calculation source:** `ledger_entries`.
- **Journal evidence source:** `voucher_lines` plus `vouchers`.
- **Inventory value source:** `stock_ledger`, separate from the GL.
- **Certified single source of truth:** Not yet achieved.

## Source-to-report matrix

| Report | Primary source | Filters | Material limitations |
|---|---|---|---|
| Trial Balance | accounts LEFT JOIN ledger_entries | account company, date, account soft-delete | No voucher status; no ledger company predicate; no opening/movement/closing split |
| Profit and Loss | accounts LEFT JOIN ledger_entries | Income/Expense type, date | No governed P&L sections; no voucher status |
| Balance Sheet | accounts LEFT JOIN ledger_entries | Asset/Liability/Equity, entries `<= date_to` | Current profit incorrectly uses selected `date_from`; contra balances mishandled |
| GST summary | ledger_entries JOIN vouchers/accounts | company, date, voucher soft-delete | Better status trace than core statements, but still name-based ledgers |
| Inventory valuation | stock_ledger plus item opening values | stock-ledger company, warehouse scope | Global item openings can be reused across companies; no GL reconciliation |
| Receivable/payable | subledger tables and allocations | company and source state | Separate reconciliation reports exist |

## Integrity controls that pass

- `createManualVoucher` rejects cross-company account selections.
- `createBalancedVoucher` rejects unequal debit and credit totals at two decimals.
- Voucher, voucher lines, ledger entries and audit writes occur in one SQLite transaction.
- Reversal creates an opposite posted voucher rather than deleting evidence.
- Locked financial years block controlled posting paths.
- Fixture voucher lines and ledger lines had zero variance.

## Integrity controls that fail or are absent

- `createBalancedVoucher` itself does not validate account ownership.
- Empty posted vouchers are accepted.
- Draft/Cancelled exclusion is not expressed in core statement SQL.
- No database trigger/constraint enforces voucher-line balance or line-to-ledger equality.
- `accounts.opening_balance` can be created without a balancing voucher.
- No governed money precision contract exists; journal values are SQLite `REAL`.
- No accounting-to-stock reconciliation table or gate exists.
- No account-group/statutory mapping registry exists.

## Required FSR-2A control contract

1. Core statements must select only approved/posted accounting effects under an explicit state policy.
2. Every statement query must enforce account, voucher and ledger company equality.
3. Every posting entry point must validate at least two substantive lines, account ownership and line-side exclusivity.
4. The journal document and general-ledger mirror must reconcile through a verifier and, where practical, database constraints.
5. Opening balances must be voucher-backed; direct unbalanced account openings must be migrated or blocked.
6. Inventory-affecting transactions must have a governed GL bridge or a formally selected periodic-inventory policy.
7. Financial statement classification must come from a backend mapping registry, never account-name guesses in the renderer.

## Decision

**Source-of-truth clarity:** Partial  
**Source-of-truth enforcement:** Fail  
**Safe to certify financial statements:** No

