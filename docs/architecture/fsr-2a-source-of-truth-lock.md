# FSR-2A Source-of-Truth Lock

**Date:** 2026-07-24
**Contract status:** PASS
**Programme lock status:** BLOCKED

## Locked Accounting Chain

```text
Financially eligible business event
  -> governed balanced voucher
  -> voucher lines in exact minor units
  -> ledger entries in exact minor units
  -> governed opening or carry-forward evidence
  -> inventory subledger/General Ledger reconciliation
  -> Trial Balance
  -> Profit and Loss
  -> Balance Sheet
  -> ledger and voucher drill-down
  -> audit evidence
```

No user-interface value, report label, account name, compatibility mirror, or
unposted operational record may replace this chain as accounting authority.

## Authority Classification

| Classification | Fields or evidence | Rule |
|---|---|---|
| Authoritative money | All certified INTEGER `_minor` columns | Store exact paise; use for posting and report totals |
| Authoritative voucher evidence | Posted, non-deleted vouchers and balanced voucher lines | Must satisfy company, financial-year, state, and debit/credit controls |
| Authoritative ledger evidence | Posted, non-deleted ledger entries linked to governed vouchers | Must equal voucher-line minor totals |
| Authoritative openings | Governed opening vouchers and `opening_balances` minor fields | Must preserve double entry |
| Authoritative continuity | `carry_forward_entries` minor fields and source-year evidence | Must produce balanced target-year opening |
| Operational subledger | Stock ledger, receivables, payables, party allocations | Must reconcile to the relevant GL control account |
| Compatibility mirror | Legacy REAL money columns | Retained for staged compatibility; not report authority |
| Non-authoritative opening | `accounts.opening_balance` | Must not bypass governed opening entry |
| Presentation only | Renderer financial grouping, labels, formatting | Must not calculate or classify accounting truth |
| Migration control | Migration 034, compatibility state, integrity checks | Must detect missing columns, parity defects, and disagreements |
| Pending architecture | Account-group and financial-statement mapping registry | Assigned to FSR-2B |

## Authoritative Minor-Unit Columns

| Table | Columns |
|---|---|
| `accounts` | `opening_balance_minor` |
| `voucher_lines` | `debit_minor`, `credit_minor` |
| `ledger_entries` | `debit_minor`, `credit_minor`, `running_balance_minor` |
| `opening_balances` | `opening_debit_minor`, `opening_credit_minor` |
| `carry_forward_entries` | `closing_balance_minor`, `opening_debit_minor`, `opening_credit_minor` |
| `stock_ledger` | `value_minor`, `running_value_minor` |

All 13 columns are INTEGER and are introduced idempotently by migration
`034_fsr2a5b_money_shadow_columns`.

## Report Authority

- Trial Balance reads governed opening and ledger evidence.
- Profit and Loss reads posted income and expense ledger evidence for the
  selected company, financial year, and period.
- Balance Sheet reads governed balances, current profit, contra-account effects,
  and carry-forward evidence.
- Reports prefer minor-unit values over legacy REAL mirrors.
- Renderer account grouping is not accounting authority.

## Change-Control Rule

Any future change to posting, money conversion, opening balances,
carry-forward, inventory/GL reconciliation, report aggregation, drill-down, or
audit linkage requires:

1. a separate architecture audit;
2. populated expected-value tests;
3. all FSR-2A verifier reproductions;
4. full ERP regression;
5. Electron desktop smoke testing; and
6. a new architecture gate.

## Enterprise Intelligence Layer

The Enterprise Intelligence Layer registry identifies Database Graph DG-1 and
Voucher and Accounting Graph KG-4 as the relevant architecture graphs. Their
verification commands passed. No graph schema changed in this stabilization
phase; therefore, no graph version change was required.

## Boundary

This source-of-truth contract is verified. The programme-level lock remains
BLOCKED until the reviewed lock commit and restore tag exist.
