# Responses to the 78f71da audits (16 Nov 2026 IST)

Fixed in the next commit:
- Correctness L-1, Security L-2 (partial unique index accepted): each lock is now compared with the app's own CREATE statement (normalised `sqlite_master.sql`), so a partial, non-unique or re-columned index, or a lock trigger with a WHEN clause, is rebuilt.
- Correctness L-1, Security L-4 (silent repairs): every repair is logged in `stock_return_receipts_locks_restored` (`triggersRemoved`, `lockRestored: missing|altered`, `indexesRestored` with `was`). Migration 039 now makes the locks itself, so a new database logs nothing (test). A database built by 91e2fa1 gets one entry, which is accurate.
- Security L-1 (case-sensitive table match; triggers on other tables): the sweep removes any trigger whose table is `stock_return_receipts` in any case, or whose SQL names it (as `unexpectedLedgerTriggers` does).
- Security L-3 (name collision stops start-up): an index of that name on another table is rebuilt. A table, view or trigger holding the name is reported in `stock_return_receipts_lock_blocked` and start-up continues.
- Security L-4 (table replaced by a view): once 039 has run, a missing or non-table `stock_return_receipts` writes `stock_return_receipts_table_missing` and a console error.
- Architecture L-1, Correctness I-1 (duplicates logged on every start; message wrong): duplicates and name conflicts go to their own action, `stock_return_receipts_lock_blocked`, written only when the problem changes. The console message says the unique lock is off. The DG-1 note names the exception.
- Architecture I-1: DG-1 `generatedAt` updated with the version.
- Architecture I-2: KG-4 lists the `stock return receipts backfilled` audit event under postStockReturn.

Answered, not changed:
- Correctness I-1 (duplicate rows make later returns count the receipt twice): only an edited file can hold them. Start-up now reports them, so the owner can remove them before posting. Pricing does not try to second-guess the record.
- Correctness, untested order (lock step before ensureLedgerGuards): the step no longer throws, so order does not change the outcome. The duplicate test still checks that the ledger guards are back.
- Security I-1 (table definition not checked): a check that each table still matches its migration belongs in a general schema check across all tables, not one table. Noted as a residual.

Mutation checks: dropping the mention sweep, the index SQL comparison, the trigger SQL comparison, the once-per-change check, or the name-conflict branch, or removing the locks from migration 039, each fail a test.

Checks: test:integrity 242 + 56; lint and build clean; 10 graph verifiers, 14 Electron verifiers and FSR-2A.4 pass; upgrade rehearsal from main passes; smoke test at three sizes with no overflow and 0 errors.
