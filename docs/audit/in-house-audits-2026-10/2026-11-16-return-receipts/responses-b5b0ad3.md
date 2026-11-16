# Responses to the b5b0ad3 audits (16 Nov 2026 IST)

Counts at b5b0ad3: correctness 0 Low and 1 Info; security 1 Low and 1 Info. Architecture was clean at 2dd78bc (Info only), and nothing structural changed since.

Fixed in the next commit:
- Security L-1 and correctness I-1 are the same case: an index named stock_return_receipts in a database from before 039 still stopped every start. `returnReceiptsTableState` now also looks at indexes, so it returns "index". Migration 039 takes its early return, and the start-up check reports the name as a missing table. Test case "RR IdxPre" added to "a table in name only does not stop the app, before or after migration 039". Leaving `index` out of the lookup fails that test.
- Security I-1 (catch block's own audit write unguarded): that write is now in its own try/catch and falls back to the console only.

Answered, not changed:
- Correctness note (no test reaches the start-up try/catch): neither audit could build a file that reaches it. It is a last-resort guard, and a lasting fault there would write one entry per start. That is acceptable for a state that should never occur.
- Security note (a table rebuilt WITHOUT ROWID is accepted): it is still a table with the app's columns, and its locks are put back. A full check of the table definition remains for a general schema check, as answered before.

Checks:
- test:integrity: 245 + 56 pass.
- Lint and build are clean.
- Graph and Electron verifiers, and FSR-2A.4, pass.
- The upgrade rehearsal from main passes.
