# Money Schema Matrix — FSR-2A.5B

## Shadow Column Matrix

| Table | Legacy Column | Type | Shadow Column | Shadow Type | Notes |
|---|---|---|---|---|---|
| voucher_lines | debit | REAL | debit_minor | INTEGER NOT NULL DEFAULT 0 | Authoritative money |
| voucher_lines | credit | REAL | credit_minor | INTEGER NOT NULL DEFAULT 0 | Authoritative money |
| ledger_entries | debit | REAL | debit_minor | INTEGER NOT NULL DEFAULT 0 | Authoritative money |
| ledger_entries | credit | REAL | credit_minor | INTEGER NOT NULL DEFAULT 0 | Authoritative money |
| ledger_entries | running_balance | REAL | running_balance_minor | INTEGER NOT NULL DEFAULT 0 | Authoritative money |
| opening_balances | opening_debit | REAL | opening_debit_minor | INTEGER NOT NULL DEFAULT 0 | Authoritative money |
| opening_balances | opening_credit | REAL | opening_credit_minor | INTEGER NOT NULL DEFAULT 0 | Authoritative money |
| carry_forward_entries | closing_balance | REAL | closing_balance_minor | INTEGER NOT NULL DEFAULT 0 | Authoritative money |
| carry_forward_entries | opening_debit | REAL | opening_debit_minor | INTEGER NOT NULL DEFAULT 0 | No legacy shadow; added for consistency |
| carry_forward_entries | opening_credit | REAL | opening_credit_minor | INTEGER NOT NULL DEFAULT 0 | No legacy shadow; added for consistency |
| accounts | opening_balance | REAL | opening_balance_minor | INTEGER NOT NULL DEFAULT 0 | Authoritative money |
| stock_ledger | value | REAL | value_minor | INTEGER NOT NULL DEFAULT 0 | Authoritative money (total line value) |
| stock_ledger | running_value | REAL | running_value_minor | INTEGER NOT NULL DEFAULT 0 | Authoritative money (running total) |
| stock_ledger | rate | REAL | (none — keep REAL) | — | RATE type, 4dp precision |

## Idempotent Migration DDL

Each `ALTER TABLE` must be gated by an existence check:

```sql
-- Example pattern for every shadow column:
SELECT COUNT(*) FROM pragma_table_info('voucher_lines') WHERE name = 'debit_minor';
-- If count = 0, execute:
ALTER TABLE voucher_lines ADD COLUMN debit_minor INTEGER NOT NULL DEFAULT 0;
```

Repeat for all shadow columns listed in the matrix above.

## Backfill SQL

```sql
UPDATE voucher_lines SET debit_minor = CAST(ROUND(debit * 100) AS INTEGER);
UPDATE voucher_lines SET credit_minor = CAST(ROUND(credit * 100) AS INTEGER);
UPDATE ledger_entries SET debit_minor = CAST(ROUND(debit * 100) AS INTEGER);
UPDATE ledger_entries SET credit_minor = CAST(ROUND(credit * 100) AS INTEGER);
UPDATE ledger_entries SET running_balance_minor = CAST(ROUND(running_balance * 100) AS INTEGER);
UPDATE opening_balances SET opening_debit_minor = CAST(ROUND(opening_debit * 100) AS INTEGER);
UPDATE opening_balances SET opening_credit_minor = CAST(ROUND(opening_credit * 100) AS INTEGER);
UPDATE carry_forward_entries SET closing_balance_minor = CAST(ROUND(closing_balance * 100) AS INTEGER);
UPDATE carry_forward_entries SET opening_debit_minor = CAST(ROUND(opening_debit * 100) AS INTEGER);
UPDATE carry_forward_entries SET opening_credit_minor = CAST(ROUND(opening_credit * 100) AS INTEGER);
UPDATE accounts SET opening_balance_minor = CAST(ROUND(opening_balance * 100) AS INTEGER);
UPDATE stock_ledger SET value_minor = CAST(ROUND(value * 100) AS INTEGER);
UPDATE stock_ledger SET running_value_minor = CAST(ROUND(running_value * 100) AS INTEGER);
```

## Reconciliation Query

```sql
-- Disagreement detection per shadow column
SELECT id, debit AS legacy, debit_minor AS minor,
       CAST(ROUND(debit * 100) AS INTEGER) - debit_minor AS diff
FROM voucher_lines
WHERE CAST(ROUND(debit * 100) AS INTEGER) != debit_minor;

SELECT id, credit AS legacy, credit_minor AS minor,
       CAST(ROUND(credit * 100) AS INTEGER) - credit_minor AS diff
FROM voucher_lines
WHERE CAST(ROUND(credit * 100) AS INTEGER) != credit_minor;
```

Same pattern for every table: compare `CAST(ROUND(legacy * 100) AS INTEGER)` against the shadow column and report non-zero diffs.
