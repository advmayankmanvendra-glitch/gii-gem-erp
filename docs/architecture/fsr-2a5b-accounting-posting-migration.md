# Accounting Posting Migration — FSR-2A.5B

## Write Path Updates

### 1. createBalancedVoucher (`accountingService.js:109`)

**Current:** Writes `debit`, `credit` as REAL from user input.

**Change:** Also writes `debit_minor`, `credit_minor` using `parseMoneyToMinor(line.debit)` / `parseMoneyToMinor(line.credit)`.

**Balance check:** Replace 2-decimal rounding comparison with exact minor-unit comparison:
```javascript
// Before (2dp tolerant):
// const totalDebit = lines.reduce(...).toFixed(2);
// const totalCredit = lines.reduce(...).toFixed(2);

// After (exact):
const totalDebitMinor = lines.reduce((sum, l) => sum + l.debit_minor, 0);
const totalCreditMinor = lines.reduce((sum, l) => sum + l.credit_minor, 0);
if (totalDebitMinor !== totalCreditMinor) throw new VoucherError('Debit and credit must balance in paise');
```

**Validation:** Call `assertMoney` on each minor value before transaction begins.

**INSERT:** Both legacy and shadow columns written in the same statement:
```sql
INSERT INTO voucher_lines (voucher_id, debit, credit, debit_minor, credit_minor, ...)
VALUES (?, ?, ?, ?, ?, ...);
```

### 2. postLedgerEntry (`init.js:1104`)

**Current:** Writes `debit`, `credit`, `running_balance` as REAL.

**Change:** Also writes `debit_minor`, `credit_minor` (passed from caller), `running_balance_minor`.

**Running balance** becomes exact in minor units:
```javascript
const runningBalanceMinor = previousRunningMinor + deltaMinor;
```

Where `deltaMinor` = `debit_minor - credit_minor` (or `credit_minor - debit_minor` depending on posting direction).

### 3. createPartyOpeningBalance (`accountingService.js:793`)

**Current:** Writes `opening_debit`, `opening_credit` from payload.

**Change:** Adds `opening_debit_minor = parseMoneyToMinor(payload.opening_debit)`, `opening_credit_minor = parseMoneyToMinor(payload.opening_credit)`.

### 4. createOpeningBalance (`accountingService.js:869`)

Same pattern as party opening balance. Parse payload money values to minor units and shadow-write.

### 5. closeFinancialYear (`accountingService.js:913`)

**Current:** Reads balance sheet totals as REAL, writes `carry_forward_entries` with REAL values.

**Change:** Reads balance sheet in minor units (via `SUM(debit_minor)`, `SUM(credit_minor)` aggregations). Writes `closing_balance_minor`, `opening_debit_minor`, `opening_credit_minor`.

Legacy REAL columns are also written (dual-write), but the source of truth shifts to minor-unit aggregations.

### 6. Reversal (`reverseVoucher`)

Since reversal swaps debit and credit, minor-unit columns follow the swap exactly:
```sql
INSERT INTO voucher_lines (..., debit, credit, debit_minor, credit_minor)
SELECT ..., credit, debit, credit_minor, debit_minor FROM original_lines;
```

## Migration State Machine

| Phase | Description | Downtime |
|---|---|---|
| **Phase 1** | Add shadow columns via ALTER TABLE (idempotent DDL) | None |
| **Phase 2** | Backfill existing data via UPDATE (background batch) | None (read-only table lock) |
| **Phase 3** | Enable dual-write on all accounting write paths | None |
| **Phase 4** | Verify parity between legacy REAL and shadow INTEGER columns via reconciliation queries | None |
| **Phase 5** | Switch report/read consumers to minor-unit columns | None (coordinated deploy) |
| **Phase 6** | Make legacy REAL columns secondary (not dropped; may be deprecated in future schema) | None |

### State Tracking

A `schema_migrations` table or equivalent tracks which phases have been applied:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO schema_migrations (version, description) VALUES (1, 'Phase 1: Add money shadow columns');
INSERT INTO schema_migrations (version, description) VALUES (2, 'Phase 2: Backfill shadow column data');
INSERT INTO schema_migrations (version, description) VALUES (3, 'Phase 3: Enable dual-write');
INSERT INTO schema_migrations (version, description) VALUES (4, 'Phase 4: Verify parity');
INSERT INTO schema_migrations (version, description) VALUES (5, 'Phase 5: Switch consumers to minor');
INSERT INTO schema_migrations (version, description) VALUES (6, 'Phase 6: Legacy columns secondary');
```
