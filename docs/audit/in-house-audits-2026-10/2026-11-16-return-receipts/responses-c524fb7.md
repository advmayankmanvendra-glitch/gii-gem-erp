# Responses to the c524fb7 audits (16 Nov 2026 IST)

The lock code moved to one module, `src/main/database/returnReceiptLocks.js`. The migration, the start-up check and the Health Center check all use its definitions.

Fixed in the next commit:
- Correctness L-1, Security L-1: a trigger or view under an index's name no longer keeps the unique lock off. The name is looked up only among indexes, tables and views, with the index first. A view holding the name is dropped and logged (`replacedView`). Only a table holding it is reported as a conflict. Test "a trigger or view under an index's name does not keep the unique lock off".
- Security L-2: migration 039 makes the locks with IF NOT EXISTS. It leaves the unique index to the start-up check when the file already holds duplicates or the name is taken, so a replayed 039 never stops start-up. Also fixed, found by the new test: two pre-upgrade backups taken in the same second no longer fail on the file name (`backupBeforePendingMigration` adds a suffix). Test "a migration replayed on a file that already has the locks, or duplicates, does not stop the app".
- Correctness L-2, Security L-3, Architecture I-1: `stock_return_receipts_lock_blocked` is a state log. It is written when the problem appears, changes or clears (cleared = empty lists), so a problem that comes back is logged again. The duplicate test covers appear, clear and come back.
- Architecture L-2, Correctness I-1: `stock_return_receipts_table_missing` uses the same state log, so it is written once, not on every start. Test reopens twice.
- Architecture L-1: the money integrity report has `return_receipt_locks` (null when all is in place), and `ok` is false while any lock problem stands. The Health Center panel shows one line saying what is wrong and what to do.
- Architecture I-2: `RETURN_RECEIPTS_TRIGGERS` lists the app's own triggers on the table. The sweep keeps those and removes the rest.

Answered, not changed:
- Security I-1 (a crafted file can make the sweep drop an app-owned mapping guard until the next start): as the audit says, such a file could keep a weakened guard under the same name anyway, so this adds no exposure. The mapping guards are rebuilt on every start.
- Architecture, outside the diff (KG-4 `compatibility.DG-1` reads v1.0.0): left for the KG-4 v1.1 / FF-1 naming pass, as before. Nothing reads it as a constraint.

Mutation checks: dropping the mention sweep, the IF NOT EXISTS in the migration, the duplicate check in the migration, the Health Center `ok` fold, the state log for the missing table, the cleared-state logging, or the view branch each fail a test. The type filter on the name lookup is belt and braces: the index-first order alone already prevents the bypass.

Checks: test:integrity 244 + 56. Lint and build are clean. The 10 graph verifiers, 14 Electron verifiers and FSR-2A.4 pass. The upgrade rehearsal from main passes. The smoke test at three sizes shows no overflow and 0 errors.
