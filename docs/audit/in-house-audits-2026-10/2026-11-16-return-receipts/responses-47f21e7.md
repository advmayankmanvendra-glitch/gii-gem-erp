# Responses to the 47f21e7 audits (16 Nov 2026 IST)

Fixed in the next commit:
- Correctness M-1 (an earlier return that used no receipt was backfilled, with an empty audit entry, on every later return): backfill skips returns with no receipts; test "an earlier return that used no receipt is not backfilled again and again".
- Correctness L-1: the recordReturnReceipts comment now says billed rows match the Trade Payables debit only when receipts cover the whole return.
- Correctness L-2: tests added for billed rows, and for a return that mixes billed and unbilled receipts (each kind rounded on its own running total).
- Security L-1: the no-update trigger and the unique index are made on every start, outside migration 039, so a database opened by an earlier build of 039 gets them; test "trigger and index recreated at start-up".
- Security L-2: the migration-list test resolves constants across src/main/database and matches only call lines.
- Architecture L-1: KG-4 line numbers refreshed (7 entries).
- Architecture L-2: wording fixed.
- Architecture L-3: DG-1 relationships and the 039 mapping moved to the end of their lists; lastValidated set to 2026-11-16.

Answered, not changed:
- Architecture L-3, DG-1 version not bumped: DG-1's version tracks schema changes to the graph file itself (fields, index object shape), not new entries. Adding a table follows the existing shape, as migrations 033 to 036 did without a bump.

Mutation checks: removing the empty-backfill filter, sharing one running total, and moving the trigger back inside the migration each fail at least one test.

Checks at the new head: test:integrity 238 + 56 pass; lint and build clean; 10 graph verifiers, 14 Electron verifiers and FSR-2A.4 pass; upgrade rehearsal from main (backup taken, 2 backfill + 2 posting rows, GRNI cleared 600, integrity ok, 0 FK errors); smoke test at phone, small and desktop sizes with no overflow and 0 errors.
