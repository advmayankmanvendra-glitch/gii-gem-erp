# Report Parity Certification — FSR-2A.5B

## Trial Balance Parity

| Aspect | Detail |
|--------|--------|
| **Current source** | `ledger_entries.debit` (REAL), `ledger_entries.credit` (REAL) |
| **Future source** | `ledger_entries.debit_minor` (INTEGER), `ledger_entries.credit_minor` (INTEGER) |
| **Opening (current)** | `carry_forward_entries.opening_debit` (REAL), `carry_forward_entries.opening_credit` (REAL) |
| **Opening (future)** | `carry_forward_entries.opening_debit_minor` (INTEGER), `carry_forward_entries.opening_credit_minor` (INTEGER) |
| **Fallback (current)** | `accounts.opening_balance` (REAL) |
| **Fallback (future)** | `accounts.opening_balance_minor` (INTEGER) |

**Parity query:**

```sql
SELECT
  account_id,
  ROUND(SUM(debit), 2)        AS real_debit,
  CAST(SUM(debit_minor) AS REAL) / 100 AS minor_debit,
  ROUND(SUM(debit), 2) - CAST(SUM(debit_minor) AS REAL) / 100 AS diff_debit,
  ROUND(SUM(credit), 2)       AS real_credit,
  CAST(SUM(credit_minor) AS REAL) / 100 AS minor_credit,
  ROUND(SUM(credit), 2) - CAST(SUM(credit_minor) AS REAL) / 100 AS diff_credit
FROM ledger_entries
GROUP BY account_id;
```

**Threshold:** `|diff| <= 0.01` per account (1 paise tolerance for legacy rounding).

---

## P&L Parity

| Aspect | Detail |
|--------|--------|
| **Current source** | `ledger_entries.debit` (REAL), `ledger_entries.credit` (REAL) |
| **Future source** | `ledger_entries.debit_minor` (INTEGER), `ledger_entries.credit_minor` (INTEGER) |

**Parity query:**

```sql
SELECT
  a.account_id,
  a.account_name,
  ROUND(SUM(le.debit), 2)        AS real_debit,
  CAST(SUM(le.debit_minor) AS REAL) / 100 AS minor_debit,
  ROUND(SUM(le.debit), 2) - CAST(SUM(le.debit_minor) AS REAL) / 100 AS diff_debit,
  ROUND(SUM(le.credit), 2)       AS real_credit,
  CAST(SUM(le.credit_minor) AS REAL) / 100 AS minor_credit,
  ROUND(SUM(le.credit), 2) - CAST(SUM(le.credit_minor) AS REAL) / 100 AS diff_credit
FROM ledger_entries le
JOIN accounts a ON a.account_id = le.account_id
WHERE a.account_type IN ('Income', 'Expense')
GROUP BY a.account_id;
```

**Threshold:** `|diff| <= 0.01` per account.

---

## Balance Sheet Parity

| Aspect | Detail |
|--------|--------|
| **Current source** | `ledger_entries.debit/credit` (REAL), `carry_forward_entries.opening_debit/opening_credit` (REAL) |
| **Future source** | `ledger_entries.debit_minor/credit_minor` (INTEGER), `carry_forward_entries.opening_debit_minor/opening_credit_minor` (INTEGER) |

**Parity query:** Same as Trial Balance parity query, additionally including carry-forward opening balances.

**Threshold:** `|diff| <= 0.01` per account.

---

## Party Ledger Parity

| Aspect | Detail |
|--------|--------|
| **Current source** | `voucher_lines.debit` (REAL), `voucher_lines.credit` (REAL) |
| **Future source** | `voucher_lines.debit_minor` (INTEGER), `voucher_lines.credit_minor` (INTEGER) |

**Parity query:**

```sql
SELECT
  party_id,
  ROUND(SUM(debit), 2)        AS real_debit,
  CAST(SUM(debit_minor) AS REAL) / 100 AS minor_debit,
  ROUND(SUM(debit), 2) - CAST(SUM(debit_minor) AS REAL) / 100 AS diff_debit,
  ROUND(SUM(credit), 2)       AS real_credit,
  CAST(SUM(credit_minor) AS REAL) / 100 AS minor_credit,
  ROUND(SUM(credit), 2) - CAST(SUM(credit_minor) AS REAL) / 100 AS diff_credit
FROM voucher_lines
GROUP BY party_id;
```

**Threshold:** `|diff| <= 0.01` per party.

---

## GST Summary Parity

| Aspect | Detail |
|--------|--------|
| **Current source** | `ledger_entries.debit/credit` (REAL) for GST accounts |
| **Future source** | `ledger_entries.debit_minor/credit_minor` (INTEGER) for GST accounts |

**Parity query:** Same as Trial Balance parity filtered to GST-relevant account groups.

**Threshold:** `|diff| <= 0.01` per GST account.

---

## Stock Value Parity

| Aspect | Detail |
|--------|--------|
| **Current source** | `stock_ledger.value` (REAL), `stock_ledger.running_value` (REAL) |
| **Future source** | `stock_ledger.value_minor` (INTEGER), `stock_ledger.running_value_minor` (INTEGER) |

**Parity query:**

```sql
SELECT
  item_id,
  ROUND(SUM(value), 2)                  AS real_value,
  CAST(SUM(value_minor) AS REAL) / 100  AS minor_value,
  ROUND(SUM(value), 2) - CAST(SUM(value_minor) AS REAL) / 100 AS diff_value,
  ROUND(SUM(running_value), 2)                  AS real_running,
  CAST(SUM(running_value_minor) AS REAL) / 100  AS minor_running,
  ROUND(SUM(running_value), 2) - CAST(SUM(running_value_minor) AS REAL) / 100 AS diff_running
FROM stock_ledger
GROUP BY item_id;
```

**Threshold:** `|diff| <= 0.01` per item.

---

## Certification Gate

**ALL parity checks must show `|diff| <= 0.01` per row.**

A report is certified only when every parity check across all financial reports passes this threshold. Any account, party, or item with `diff > 0.01` must be investigated and resolved before the minor-unit migration can be considered production-ready.
