# Double-Entry Accounting Engine Audit Report

**Audit Date:** 2026-07-08  
**Audit Scope:** GII GeM ERP — Accounting Engine  
**Source File:** `src/main/database/init.js` (9,277 lines) + `src/main/database/connection.js` (44 lines)  
**Audit Objectives:** Verify double-entry compliance, transaction safety, ledger integrity, and reporting accuracy.

---

## 1. Executive Summary

| Criterion | Status |
|-----------|--------|
| Double-entry model | **PASS** — every posted voucher enforces Debit = Credit |
| Chart of Accounts | **PASS** — 5 account types (Asset/Liability/Equity/Income/Expense) with normal_balance |
| Voucher header table | **PASS** — `vouchers` table with 11 registered voucher types |
| Voucher lines table | **PASS** — `voucher_lines` with debit/credit fields per line |
| Ledger entries table | **PASS** — `ledger_entries` with running balance per account |
| Debit = Credit enforcement | **PASS** — checked in `createBalancedVoucher` before insert |
| Transaction atomicity | **PASS** — wrapped in `db.transaction(() => { ... })` |
| Partial saves cannot corrupt | **PASS** — accounting tables protected by `WRITE_POLICY.accountingReadOnly` |
| Trial Balance from ledger | **PASS** — SQL query aggregates `ledger_entries` |
| Balance Sheet / P&L from ledger | **PASS** — reports derive from `ledger_entries` (cumulative) |
| Posting status state machine | **PASS** — Draft → Posted/Reversed with status tracking |
| Soft-delete protection | **PASS** — `is_deleted` flag on all sensitive tables |
| Audit log | **PASS** — all postings, reversals, and status changes audited |
| SQLite PRAGMAs | **WARNING** — only 2 of 6 recommended PRAGMAs are set |
| Database triggers | **INFO** — zero triggers; enforcement is application-layer (acceptable for app-controlled DB) |

**Overall Verdict: DOUBLE-ENTRY COMPLIANT.** The engine uses a proper double-entry bookkeeping model. No loose single-entry income/expense patterns detected.

---

## 2. Schema Verification

### 2.1 Chart of Accounts — `accounts` table

```
id                  INTEGER PRIMARY KEY AUTOINCREMENT
company_id          INTEGER NOT NULL       → FK companies(id)
account_name        TEXT NOT NULL
account_code        TEXT NOT NULL
account_type        TEXT NOT NULL           → CHECK: Asset|Liability|Equity|Income|Expense
parent_account_id   INTEGER                → FK accounts(id)
opening_balance     REAL NOT NULL DEFAULT 0
normal_balance      TEXT NOT NULL           → CHECK: Debit|Credit
status              TEXT NOT NULL DEFAULT 'active'
is_deleted          INTEGER NOT NULL DEFAULT 0
UNIQUE(company_id, account_code)
```

**Findings:**
- Classification into 5 account types with CHECK constraint.
- `normal_balance` field correctly governs debit/credit behavior in `postLedgerEntry`, `trialBalance`, `balanceSheetReport`, and `profitLossReport`.
- Hierarchical via `parent_account_id` (self-referencing FK).
- Soft-delete enabled via `is_deleted` flag.

### 2.2 Voucher Header — `vouchers` table

```
id                  INTEGER PRIMARY KEY AUTOINCREMENT
company_id          INTEGER NOT NULL       → FK companies(id)
voucher_number      TEXT NOT NULL
voucher_date        TEXT NOT NULL
voucher_type        TEXT NOT NULL           → CHECK: Sales|Purchase|Receipt|Payment|Journal|
                                           →         Credit Note|Debit Note|Contra
narration           TEXT
source_module       TEXT                    → e.g., "billing", "procurement", "guided_vouchers"
source_id           INTEGER                → FK to source record
status              TEXT NOT NULL DEFAULT 'Posted'
financial_year_id   INTEGER
reversal_reason     TEXT
reversal_date       TEXT
reversed_by         INTEGER                → FK users(id)
approval_status     TEXT NOT NULL DEFAULT 'Approved'
is_deleted          INTEGER NOT NULL DEFAULT 0
UNIQUE(company_id, voucher_number)
```

**Findings:**
- 8 voucher types defined with CHECK constraint (Sales, Purchase, Receipt, Payment, Journal, Credit Note, Debit Note, Contra).
- `source_module` + `source_id` provides traceability back to originating business transaction.
- `status` defaults to `'Posted'` — vouchers are only created at posting time.
- `approval_status` defaults to `'Approved'` for direct postings; guided vouchers use a separate status flow.
- `financial_year_id` links to the financial year for period control.
- Reversal metadata preserved.

### 2.3 Voucher Lines — `voucher_lines` table

```
id                  INTEGER PRIMARY KEY AUTOINCREMENT
voucher_id          INTEGER NOT NULL       → FK vouchers(id)
account_id          INTEGER NOT NULL       → FK accounts(id)
debit               REAL NOT NULL DEFAULT 0
credit              REAL NOT NULL DEFAULT 0
narration           TEXT
linked_party_type   TEXT                   → "department", "supplier"
linked_party_id     INTEGER
```

**Findings:**
- Each line carries EITHER debit OR credit (or both zero — caught by balancing check).
- `linked_party_type` / `linked_party_id` enables subledger tracking (department-level receivables, supplier-level payables).
- Enforced by FK constraints to `vouchers` and `accounts`.

### 2.4 Ledger Entries — `ledger_entries` table

```
id                  INTEGER PRIMARY KEY AUTOINCREMENT
company_id          INTEGER NOT NULL       → FK companies(id)
voucher_id          INTEGER NOT NULL       → FK vouchers(id)
voucher_line_id     INTEGER NOT NULL       → FK voucher_lines(id)
account_id          INTEGER NOT NULL       → FK accounts(id)
entry_date          TEXT NOT NULL
debit               REAL NOT NULL DEFAULT 0
credit              REAL NOT NULL DEFAULT 0
running_balance     REAL NOT NULL DEFAULT 0
source_module       TEXT
source_id           INTEGER
```

**Findings:**
- Running balance computed and stored per account per entry (allows efficient ledger queries).
- Links back to individual voucher lines (full audit trail).
- Date field enables period-filtered reporting.

### 2.5 Financial Years — `financial_years` table

```
id                    INTEGER PRIMARY KEY AUTOINCREMENT
company_id            INTEGER NOT NULL       → FK companies(id)
financial_year_name   TEXT NOT NULL
start_date            TEXT NOT NULL
end_date              TEXT NOT NULL
status                TEXT NOT NULL DEFAULT 'Open'   → 'Open','Closed','Locked'
locked_at             TEXT
locked_by             INTEGER                → FK users(id)
UNIQUE(company_id, financial_year_name)
```

**Findings:**
- Financial year status controls posting ability (Open = allowed; Closed/Locked = blocked).
- `assertOpenFinancialYear()` enforces this check before every `createBalancedVoucher` call.

### 2.6 Audit Log — `audit_log` table

```
id          INTEGER PRIMARY KEY AUTOINCREMENT
company_id  INTEGER                → FK companies(id)
user_id     INTEGER                → FK users(id)
action      TEXT NOT NULL           → "voucher posting", "voucher reversal", etc.
table_name  TEXT NOT NULL
record_id   INTEGER
old_value   TEXT                   → JSON
new_value   TEXT                   → JSON
user_role   TEXT
module      TEXT
event_hash  TEXT
```

**Findings:**
- Every voucher posting, reversal, status change, and opening balance creation is logged.
- Old/new values stored as JSON for before/after comparison.
- User role and module context included for traceability.

### 2.7 Supporting Tables

| Table | Purpose | Debit/Credit Usage |
|-------|---------|-------------------|
| `opening_balances` | Opening balance tracking | Separate `opening_debit`/`opening_credit` fields; bridges to voucher |
| `receivables` | Department receivable tracking | Posted via `upsertReceivable` after sales posting |
| `payment_allocations` | Payment-to-invoice matching | Tracks allocation amounts, TDS, deductions |
| `cash_bank_ledger` | Cash/bank book | `debit`/`credit` with running balance |
| `supplier_payments` | Supplier payment tracking | `posting_status` based |
| `invoice_items` | Invoice line items (GST breakdown) | Taxable value + CGST/SGST/IGST |
| `procurement_items` | Procurement line items | Taxable value + GST breakdown |

---

## 3. Core Posting Function — `createBalancedVoucher`

### 3.1 Debit = Credit Enforcement (line 5178)

```js
const totalDebit = payload.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
const totalCredit = payload.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
  throw new Error(`Unbalanced voucher: debit ${totalDebit}, credit ${totalCredit}`);
}
```

- Compares debit and credit totals with 2-decimal precision.
- Error thrown before any insert occurs — no partial data is written.
- All posting functions (Sales, Purchase, Receipt, Guided, Opening Balance, Expense, Reversal) funnel through this single function.

### 3.2 Additional Validations

- **Negative amounts blocked:** `payload.lines.forEach((line) => { if (Number(line.debit || 0) < 0 || Number(line.credit || 0) < 0) throw ... })`
- **Open year enforced:** `assertOpenFinancialYear(db, payload.company_id, payload.voucher_date)` — validates financial year exists and is not Closed/Locked.
- **Account existence verified:** `accountId()` throws with descriptive error if an account name is not found in the chart.

### 3.3 Atomic Transaction (line 5186)

```js
const transaction = db.transaction(() => {
  // INSERT into vouchers
  // INSERT into voucher_lines (forEach line)
  // postLedgerEntry for each line
  // auditLog
  // auditVoucherDependencySync
  return voucher;
});
return transaction();
```

- Wrapped in `db.transaction(() => { ... })` — all-or-nothing execution.
- If any step fails (e.g., FK violation, unique constraint on voucher number), the entire transaction rolls back.
- No partial ledger state is possible.

### 3.4 Ledger Entry Posting — `postLedgerEntry` (line 5813)

```js
const previous = db.prepare(`SELECT running_balance FROM ledger_entries WHERE company_id = ? AND account_id = ?${ledgerActiveWhere} ORDER BY id DESC LIMIT 1`).get(companyId, accountIdValue);
const account = db.prepare("SELECT normal_balance FROM accounts WHERE id = ?").get(accountIdValue);
const delta = account?.normal_balance === "Credit" ? credit - debit : debit - credit;
const running = Number(previous?.running_balance || 0) + delta;
// INSERT into ledger_entries with computed running_balance
```

- Each ledger entry stores its own running balance for fast reporting.
- Delta direction is determined by the account's `normal_balance`:
  - **Credit-nature accounts** (Liability, Equity, Income): delta = credit - debit
  - **Debit-nature accounts** (Asset, Expense): delta = debit - credit
- This ensures running_balance always reflects the correct directional balance.

---

## 4. Business Module Posting Flows

### 4.1 Billing / Sales — `postSalesVoucher` (line 6324)

```
Source: invoices table (posting_status: Draft → Posted)
Accounts:
  Dr Trade Receivables    (gross = taxable + output GST)
  Cr Sales                (taxable amount)
  Cr Output GST           (output GST amount)
Calls: createBalancedVoucher → markPosted → upsertReceivable
```

### 4.2 Procurement / Purchase — `postPurchaseVoucher` (line 6360)

```
Source: procurements table (posting_status: Draft → Posted)
Accounts:
  Dr Purchase             (taxable amount)
  Dr Input GST            (input GST amount)
  Cr Trade Payables       (gross = taxable + input GST)
Calls: createBalancedVoucher → markPosted
```

### 4.3 Receipt / Payment — `postReceiptVoucher` (line 6393)

```
Source: payments table (posting_status: Draft → Posted)
Accounts:
  Dr Cash/Bank            (amount received)
  Dr TDS Receivable       (TDS deducted)
  Dr GST TDS Receivable   (GST TDS deducted)
  Cr Trade Receivables    (total = amount + TDS + GST TDS + other)
Calls: createBalancedVoucher → insert payment_allocations → refreshReceivable → updateCashBankLedger → markPosted
```

### 4.4 Guided Vouchers (Business Voucher Maker-Checker) — `postGuidedVoucher` (line 5335)

```
Source: guided_vouchers table (status: Draft → Pending Review → Pending Approval → Approved → Posted)
Voucher kinds: receipt, payment, sales, purchase, expense, employee_incentive,
              contra, credit_note, debit_note, journal
Calls: businessVoucherPayload (generates lines) → createBalancedVoucher
       → updateCashBankLedger → auto GRN/stock issue if applicable → markPosted
```

### 4.5 Reverse Voucher — `reverseVoucher` (line 5920)

```
Creates reversal voucher with SWAPPED debit/credit lines:
  Dr → Cr (original credit becomes reversal debit)
  Cr → Dr (original debit becomes reversal credit)
Calls: createBalancedVoucher (with swapped lines)
       → marks original voucher status = 'Reversed'
       → reverses receivables, payment_allocations, cash_bank_ledger
```

### 4.6 Opening Balance — `createOpeningBalance` (line 6147)

```
Accounts:
  Dr/Cr: Target account (opening balance)
  Cr/Dr: Capital (suspense/balancing account)
Voucher date: financial year start date
Calls: createBalancedVoucher → insert opening_balances
```

### 4.7 Expense Accrual — `postExpenseAccrualsForOrder` (line 6817)

```
Accounts:
  Dr Expense Head (e.g., Authorization Expense, Transport Expense, etc.)
  Cr Expense Payable
Calls: createBalancedVoucher per expense entry → markPosted
```

---

## 5. Financial Reporting

### 5.1 Trial Balance — `trialBalance()` (line 9154)

```sql
SELECT a.id, a.account_code, a.account_name, a.account_type,
  COALESCE(SUM(le.debit), 0) + CASE WHEN a.normal_balance = 'Debit' THEN a.opening_balance ELSE 0 END debit,
  COALESCE(SUM(le.credit), 0) + CASE WHEN a.normal_balance = 'Credit' THEN a.opening_balance ELSE 0 END credit,
  CASE
    WHEN a.normal_balance = 'Credit' THEN COALESCE(SUM(le.credit - le.debit), 0) + a.opening_balance
    ELSE COALESCE(SUM(le.debit - le.credit), 0) + a.opening_balance
  END balance
FROM accounts a
LEFT JOIN ledger_entries le ON le.account_id = a.id AND le.entry_date BETWEEN ? AND ?
WHERE a.company_id = ? AND a.is_deleted = 0
GROUP BY a.id
```

- Directly aggregates `ledger_entries`.
- Respects account normal_balance for directional balance computation.
- Includes opening balances.

### 5.2 Profit & Loss — `profitLossReport()` (line 9172)

```sql
SELECT a.id, a.account_code, a.account_name, a.account_type,
  COALESCE(SUM(le.debit), 0) debit,
  COALESCE(SUM(le.credit), 0) credit
FROM accounts a
LEFT JOIN ledger_entries le ON le.account_id = a.id AND le.entry_date BETWEEN ? AND ?
WHERE a.company_id = ? AND a.is_deleted = 0 AND a.account_type IN ('Income','Expense')
GROUP BY a.id
```

- Filters to Income and Expense account types only.
- Income reported from credit minus debit; Expenses reported from debit minus credit.

### 5.3 Balance Sheet — `balanceSheetReport()` (line 9192)

```sql
SELECT a.id, a.account_code, a.account_name, a.account_type, a.normal_balance,
  COALESCE(SUM(le.debit), 0) debit,
  COALESCE(SUM(le.credit), 0) credit,
  a.opening_balance
FROM accounts a
LEFT JOIN ledger_entries le ON le.account_id = a.id AND le.entry_date <= ?
WHERE a.company_id = ? AND a.is_deleted = 0 AND a.account_type IN ('Asset','Liability','Equity')
GROUP BY a.id
```

- Cumulative up to `dateTo` (not filtered to period window).
- Includes current period P&L in liabilities+equity total.

---

## 6. Partial Save / Ledger Corruption Protection

### 6.1 `WRITE_POLICY.accountingReadOnly` (line 205)

```js
accountingReadOnly: new Set([
  "accounts", "vouchers", "voucher_lines", "ledger_entries",
  "cash_bank_ledger", "receivables", "payment_allocations",
  "supplier_payments", "supplier_payment_allocations",
  "audit_log", "schema_migrations"
])
```

- **11 accounting tables** are blocked from generic CRUD operations.
- Any attempt to `createRecord`, `updateRecord`, or `deleteRecord` on these tables via the generic API throws an error: `"${table} is accounting-controlled and cannot be modified through generic ${action}"`.
- These tables can ONLY be modified through controlled posting/approval/reversal functions.

### 6.2 `assertWriteAllowed()` check (line 2722)

```js
export function assertWriteAllowed(table, action) {
  if (WRITE_POLICY.accountingReadOnly.has(table)) {
    throw new Error(`${table} is accounting-controlled...`);
  }
  if (!WRITE_POLICY.master.has(table) && !WRITE_POLICY.transaction.has(table)) {
    throw new Error(`No generic ${action} permission for ${table}`);
  }
}
```

- Called at the entry point of every generic create/update/delete IPC operation.
- Prevents any UI code or generic API call from directly modifying accounting tables.

### 6.3 Business Transaction Lifecycle

```
Draft State ──▶ Save (only non-accounting tables) ──▶ Post (creates voucher + ledger entries)
                                                        │
                                                        ▼
                                                   Posted State ──▶ Reverse (creates reversal voucher)
```

- Before posting: Business records exist in `invoices`/`procurements`/`payments` with `posting_status = 'Draft'`.
- No voucher or ledger entry is created until the explicit "Post" action.
- Draft records can be freely edited without touching ledgers.
- All postings go through `postBusinessTransaction` → `createBalancedVoucher` → atomic insert into `vouchers`, `voucher_lines`, `ledger_entries`.

---

## 7. SQLite PRAGMA Configuration

| PRAGMA | Status | Current Value | Recommended | Impact |
|--------|--------|---------------|-------------|--------|
| `journal_mode` | ✅ SET | `WAL` | `WAL` | Write-Ahead Logging enables concurrent reads during writes |
| `foreign_keys` | ✅ SET | `ON` | `ON` | Referential integrity enforced |
| `synchronous` | ❌ NOT SET | default (`FULL`) | `NORMAL` | Safety is at FULL (slower but safe). Setting to NORMAL improves write performance without meaningful risk in WAL mode. |
| `busy_timeout` | ❌ NOT SET | default (0) | `5000` | Without a timeout, concurrent write contention may fail immediately instead of retrying. |
| `cache_size` | ❌ NOT SET | default (-2000 pages) | −8000 | Larger cache improves read performance. |
| `page_size` | ❌ NOT SET | default (4096) | 4096 (acceptable) | Default is fine for this workload. |

**Risk Assessment:** LOW. The `synchronous` default of FULL provides maximum safety at a moderate performance cost. `busy_timeout` not being set is acceptable because better-sqlite3 uses synchronous API and single-connection access, so contention is minimal.

---

## 8. Transaction Safety Analysis

### 8.1 All Multi-Table Operations Use `db.transaction()`

Found **26 `db.transaction(() => { ... })` wrappers** across the codebase. Key posting transactions:

| Operation | Transaction Scope | Lines |
|-----------|-----------------|-------|
| `createBalancedVoucher` | Insert voucher + lines + ledger_entries + audit | 5186-5209 |
| `reverseVoucher` | Reversal voucher + status update + subledger cleanup | 5930-6018 |
| `postGuidedVoucher` | Post guided voucher + cash bank + audit | 5340-5384 |
| `createOpeningBalance` | Insert opening balance voucher + record | 6151-6182 |

No raw `BEGIN TRANSACTION` / `COMMIT` SQL was found. All transactions use the better-sqlite3 JavaScript API, which is the correct pattern for this driver.

### 8.2 No Triggers — Application-Layer Enforcement

Zero `CREATE TRIGGER` statements exist. All integrity rules are enforced in JavaScript:
- Debit = Credit check in `createBalancedVoucher`
- Financial year open check in `assertOpenFinancialYear`
- Positive amount check
- Account existence via `accountId`
- Status state machine via `assertRecordEditable`

This is acceptable for an application-controlled database. The `better-sqlite3` synchronous driver ensures no race conditions between the check and the insert.

---

## 9. Risks and Recommendations

### 9.1 Minor Recommendations

| # | Issue | Severity | Recommendation |
|---|-------|----------|----------------|
| 1 | `synchronous` not explicitly set (defaults to FULL) | Low | Add `db.pragma("synchronous = NORMAL")` for better write performance in WAL mode |
| 2 | No database-level triggers for debit=credit | Low | Consider adding a `CHECK(?)` trigger as defense-in-depth; currently acceptable |
| 3 | No `busy_timeout` set | Low | Add `db.pragma("busy_timeout = 5000")` for resilience under concurrent load |
| 4 | Running balance stored redundantly in `ledger_entries` | Info | Stored for reporting performance; acceptable design trade-off |

### 9.2 No Critical Issues Found

- ✅ No single-entry patterns exist. Every business transaction creates a properly balanced voucher.
- ✅ No generic CRUD access to accounting tables. All modifications go through controlled posting functions.
- ✅ All posting functions are wrapped in atomic transactions.
- ✅ Trial balance, P&L, and balance sheet all derive from `ledger_entries`.
- ✅ Debit/credit totals are enforced before any database write occurs.
- ✅ Reversal creates properly balanced contra-entries (swapped debits and credits).
- ✅ Financial year closures are enforced at posting time.
- ✅ All posting actions are audit logged with before/after snapshots.

---

## 10. Compliance Checklist

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Chart of Accounts exists | ✅ | `accounts` table with 5 account types |
| Voucher header table exists | ✅ | `vouchers` table with 8 voucher types |
| Voucher lines table exists | ✅ | `voucher_lines` table with debit/credit |
| Ledger entries table exists | ✅ | `ledger_entries` with running balance |
| Debit/credit fields present | ✅ | `debit REAL` + `credit REAL` in both voucher_lines and ledger_entries |
| Posting status tracked | ✅ | `posting_status` on all business tables |
| Audit log exists | ✅ | `audit_log` table with before/after JSON |
| Debit = Credit enforced | ✅ | `createBalancedVoucher` (Math.round precision) |
| Atomic transaction | ✅ | `db.transaction()` wrapper |
| No direct writes to accounting tables | ✅ | `WRITE_POLICY.accountingReadOnly` blocks generic CRUD |
| Trial Balance from ledger | ✅ | `trialBalance()` SQL joins accounts → ledger_entries |
| Balance Sheet from ledger | ✅ | `balanceSheetReport()` SQL aggregates ledger_entries |
| P&L from ledger | ✅ | `profitLossReport()` SQL filters Income/Expense |
| Financial year control | ✅ | `assertOpenFinancialYear()` before every posting |
| Reversal creates contra-entries | ✅ | `reverseVoucher` swaps all debit/credit |
| Journal mode = WAL | ✅ | Set in `openDatabase()` |
| Foreign keys = ON | ✅ | Set in `openDatabase()` |
| Synchronous = NORMAL or safer | ⚠️ | Default FULL (safer than recommended) |

---

## 11. Conclusion

**The GII GeM ERP accounting engine is compliant with double-entry bookkeeping standards.** All business transactions (billing, procurement, receipts, expenses, guided vouchers, reversals, opening balances) funnel through `createBalancedVoucher`, which enforces:

```
Total Debits = Total Credits  (with 2-decimal precision)
All writes in atomic transaction
Only through controlled posting service layer
```

No single-entry patterns, loose income/expense models, or direct ledger mutations were found. The architecture properly separates Draft (data entry) from Posted (accounting impact), preventing partial or erroneous ledger corruption.

**Safe to close:** Yes
