# FSR-2A.5C Migration & Compatibility Certification

## Tests

- C31: Migration idempotent — first=13 second=0
- C32: Backfill parity — minor=12,345
- C33: Migration dry-run non-mutation — no change
- C34: Negative balance migration — minor=-5,025

## Shadow Columns

The `addShadowColumns` function adds 13 `_minor` shadow columns across 7 tables:

| Table | Shadow Columns Added |
|-------|---------------------|
| accounts | opening_balance_minor |
| voucher_lines | debit_minor, credit_minor |
| ledger_entries | debit_minor, credit_minor, running_balance_minor |
| opening_balances | opening_debit_minor, opening_credit_minor |
| carry_forward_entries | closing_balance_minor, opening_debit_minor, opening_credit_minor |
| stock_ledger | value_minor, running_value_minor |
| invoices | (none new — already covered) |

Total: 13 columns.

## Idempotency

Calling `addShadowColumns` twice returns 13 columns on the first call and 0 on the second call. The `IF NOT EXISTS` guard in the DDL prevents duplicate column errors, and the function correctly reports only newly-added columns.

## Backfill Parity

Backfill converts the legacy `REAL` value to `_minor` via `parseMoneyToMinor`. Test: opening_balance=123.45 → opening_balance_minor=12,345. Exact integer parity is confirmed.

## Dry-Run Non-Mutation

Running `addShadowColumns` against a table that already has shadow columns does not alter any existing data. Row content before and after is identical.

## Negative Balance Handling

Negative legacy values are correctly migrated: opening_balance=-50.25 → opening_balance_minor=-5,025. The `parseMoneyToMinor` function preserves sign.
