# FSR-2A.5C Verifier Specification

## File

`scripts/verify-fsr-2a5c.js` — 538 lines, ES module.

## Execution Mode

The verifier auto-detects whether it is running inside Electron. If not, it spawns the local Electron binary (via `spawnSync`) with `--in-process-gpu` flags and re-executes itself. This ensures the native `better-sqlite3` module (compiled for Electron v37, NODE_MODULE_VERSION 136) is available.

## Architecture

```
main()
  ├── section1_2()  — Fixture & Source-of-Truth (C1–C11)
  ├── section3()     — Minor-Unit Authority (C12–C15)
  ├── section4()     — Report Recertification (C16–C20)
  ├── section5()     — Inventory & GL Recertification (C21–C25)
  ├── section6()     — Party Reconciliation (C26–C27)
  ├── section7()     — Financial-Year Continuity (C28–C30)
  └── section8()     — Migration & Compatibility (C31–C34)
```

## Helper Functions

| Function | Purpose |
|----------|---------|
| `withTempDb(fn)` | Creates temp SQLite DB, runs fn, cleans up |
| `s(db, sql, ...params)` | Executes `.get()` query, returns first column as Number |
| `signedMovement(db, types, df, dt)` | Sums signed ledger movement for account types |
| `postV(db, cid, fy, date, type, lines, nar)` | Creates voucher + lines + ledger entries |
| `createFixture(db)` | Creates schema + master data (32 accounts, opening balances) |
| `buildLifecycle(db)` | Posts 22 lifecycle vouchers |
| `record(name, pass, detail)` | Records and displays test result |

## Fixture Accounts

32 general-ledger heads covering: Equity (4), Asset (10), Liability (8), Income (3), Expense (7). Opening balances: Cash ₹100,000 Dr + Bank ₹200,000 Dr = Capital ₹300,000 Cr.

## Lifecycle Transactions

22 vouchers covering: purchase cycle, sales cycle, payment, receipt, returns, contra, depreciation, loan, accrual, prepaid, discounts, adjustments, debit/credit notes, round-off.

## Certification Output

After all tests, the verifier produces:
1. Individual test results (PASS/FAIL with detail)
2. Summary: `N passed, M failed, total`
3. Category-level certification (17 categories)
4. Overall verdict: CERTIFIED or NOT CERTIFIED
5. Exit code: 0 (all pass) or 1 (any fail)
