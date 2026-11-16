# Responses to the 2dd78bc audits (16 Nov 2026 IST)

Counts at 2dd78bc: correctness 0 Low and 1 Info, security 1 Low, architecture 2 Info.

Fixed in the next commit:
- Security L-1 and correctness I-1 (a table in name only, or a view before 039, stops every start):
  - `returnReceiptsTableState` accepts `stock_return_receipts` only if it is an ordinary table with the columns the app uses. Otherwise it reports "view", "virtual table" or "table without its columns", which are logged as a missing table and shown in Health Center.
  - `createReturnReceiptLocks` does nothing on such a table.
  - Migration 039 creates the table only when the name is free, so a view or virtual table already under the name no longer stops it.
  - Any unexpected error in the start-up lock check is caught. It goes to the console and to `stock_return_receipts_check_failed` in the audit log, and the start continues.
  - Test "a table in name only does not stop the app, before or after migration 039" covers virtual table and missing columns (039 recorded) and view and virtual table (039 row deleted). It checks that the ledger guards are back, the audit entry is written and Health Center is not ok.
- Correctness I-1 (comment said 039 "never fails"): comment reworded.
- Architecture I-1: DG-1 `relatedScreen` now names MoneyIntegrityPanel.jsx, and the note names returnReceiptLocks.js. These are value edits, so the version is not bumped.

Answered, not changed:
- Architecture I-2 (the `migrationApplied` check is repeated in returnReceiptLocks.js): left as is, to avoid an import cycle with init.js. It can move to a shared helper the next time either file is touched.
- Correctness, backup-name sort order within one second: no practical effect, as the audit says.
- The table's own definition (constraints, foreign keys) is still not checked beyond its columns. That belongs in a general schema check, as answered before.

Mutation checks:
- Each of these, when dropped, fails a test: the virtual-table check, the column check, the migration's early return, and the lock creation's table guard.

Checks:
- Tests: test:integrity 245 + 56 pass.
- Lint and build are clean.
- Verifiers: the 10 graph verifiers, 14 Electron verifiers and FSR-2A.4 pass.
- Upgrade rehearsal from main passes.
- Smoke test at three sizes: no overflow and 0 errors.
