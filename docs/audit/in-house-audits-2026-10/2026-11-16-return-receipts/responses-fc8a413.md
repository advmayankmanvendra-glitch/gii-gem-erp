# Responses to the fc8a413 audits (16 Nov 2026 IST)

All findings fixed in the next commit; none answered without a change.

- Security L-1 and Architecture I-1 (same-named but altered trigger or non-unique index survived a restart; planted triggers on the table survived): new `ensureReturnReceiptLocks(db)` in init.js, called from `initializeDatabase` after `ensureLedgerGuards`. It drops and recreates the lock trigger, removes any other trigger on the table, checks both indexes' columns and uniqueness (PRAGMA index_list/index_info) and rebuilds a wrong one, and writes `stock_return_receipts_locks_restored` to the audit log when it changed anything. Test "altered locks in a restored file are put back at start-up and logged".
- Security L-3 and Correctness I-1 (duplicate rows would stop every start, after the ledger guards were dropped): the lock step now runs after the ledger guards are back, checks for duplicates first, leaves the unique index off and names the rows in the audit log instead of failing. Test "duplicate recorded rows in a file do not stop the app from starting".
- Security L-2 and Correctness L-1 (migration-list test missed some call shapes; constants merged across files): the test now takes the names a fresh database records, plus every `NNN_name` string in src/main/database, and requires each one from 036 on to be in MIGRATIONS_WITH_BACKUP. No source parsing of calls or constants.
- Architecture L-1 (DG-1 version): the previous answer was wrong; the registry defines `version` as the data version and 88fa2b6 bumped it for new tables. DG-1 is now 1.2.0 in the graph, the registry record and the compatibility matrix.
- Architecture L-2: the DG-1 table note now carries the "nothing to record" clause and names the start-up lock step. Policy section 6 describes the start-up step too.

Mutation checks: keeping a same-named trigger, skipping the duplicate check, accepting any index with the right name, and adding a new migration name split over lines in another module each fail a test.

Checks: test:integrity 239 + 56; lint and build clean; 10 graph verifiers, 14 Electron verifiers and FSR-2A.4 pass; upgrade rehearsal from main passes (backup taken, GRNI cleared 600, integrity ok, 0 FK errors); smoke test at three sizes with no overflow and 0 errors.
