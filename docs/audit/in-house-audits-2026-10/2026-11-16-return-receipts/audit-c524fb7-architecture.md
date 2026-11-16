# In-house audit, pass 6: architecture, commit c524fb7 (return-receipts fix round 4)

- Date: 16 Nov 2026 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `c524fb7`
- Scope: `git diff 78f71da..c524fb7`, read against `audit-78f71da-architecture.md` and `responses-78f71da.md`.
- Method:
  - Code reading.
  - A script that checks the 23 KG-4 line numbers against the source. All 23 match.
  - A one-off in-memory SQLite check of how `sqlite_master.sql` stores `IF NOT EXISTS` DDL.
  - Verifiers, all passing:

| Verifier | Result |
|---|---|
| `verify-database-graph.js` | 32 passed, 0 failed |
| `verify-voucher-accounting-graph.js` | All checks passed |
| `verify-governance-graph-registry.js` | 53 PASS, 0 FAIL |
| `verify-audit-graph.js` | 27 passed, 0 failed |

- Read-only.

## Verdict

- My 78f71da L-1, I-1 and I-2 are closed.
- **No High or Medium findings.**
- **Two Low findings.** Both concern how the new start-up states are recorded, compared with the repo's existing start-up checks:
  - L-1: the two problem states are written only to the audit log and the console, while the existing ledger start-up failure is shown in the Money integrity check.
  - L-2: `stock_return_receipts_table_missing` is written on every start, although the policy says it is reported once per change.
- **Two Info findings:**
  - I-1: once-per-change logging records no "cleared" state.
  - I-2: the sweep's allow-list holds a single name.

## Closure of 78f71da findings

| Finding | Status | Evidence |
|---|---|---|
| L-1: duplicate path (message, repetition, DG-1 note) | Closed | Duplicates and name conflicts now go to their own action, `stock_return_receipts_lock_blocked`, written only when the problem differs from the last entry (`init.js:361-366`). The console text now says the unique lock is off. The DG-1 note (`database-graph.json:7615`) states the exception. Policy §6 (`:83`) says "once per change". |
| I-1: DG-1 `generatedAt` | Closed | `database-graph.json:6` is `2026-11-16`, in step with `version` 1.2.0, the registry record and the matrix. |
| I-2: KG-4 audit events | Closed | `voucher-accounting-graph.json:1713-1719` adds "stock return receipts backfilled" under `postStockReturn`. Its `tableImpacted` is `stock_return_receipts`, the table the rows go into. The audit row itself is filed under `table_name = 'stock_returns'` (`inventoryService.js:544`). That is acceptable, because `tableImpacted` describes the business effect. |

## Checked and found sound

- **Locks defined once.**
  - `RETURN_RECEIPTS_LOCK_SQL` and `RETURN_RECEIPTS_INDEXES` (`init.js:798-804`) are the single definition.
  - Migration 039 and `ensureReturnReceiptLocks` both use them, so the migration and the start-up check cannot drift apart.
- **Comparing stored SQL is reliable.** SQLite stores DDL without `IF NOT EXISTS`, and I confirmed this in memory. Databases made by the earlier branch builds (`fc8a413`, `78f71da`) therefore normalise to the same text and log nothing.
- **Changing migration 039's body is safe here.** `91e2fa1` is not on `origin/main`, so 039 has never shipped. The start-up step covers every branch-built database.
- **Layering.**
  - The lock logic stays in `src/main/database/init.js`, next to the other start-up `ensure*` steps.
  - No IPC, preload or route-key change. No renderer logic. No posting or voucher-amount change.
- **Naming of the new actions.**
  - `stock_return_receipts_*` follows the table-prefixed style of `stock_return_receipts_backfilled`.
  - The ledger start-up actions are prefixed `ledger_*`.
- **How the new actions compare with existing start-up records:**

| New action | Closest existing record | Match |
|---|---|---|
| `locks_restored` (one entry per repair) | `ledger_unexpected_triggers_removed` (`init.js:300`) | Consistent |
| `lock_blocked` (only when the problem changes) | `ledger_startup_check_failed` (`init.js:833`, written only for new defects) | Consistent |
| `table_missing` | see L-1 and L-2 | Inconsistent |

- **Graphs and policy.**
  - The DG-1 note, KG-4, policy §6 and the code agree on what is checked, what is repaired and what stays off.
  - Neither DG-1 nor KG-4 needs to list `ensureReturnReceiptLocks` or the three start-up actions. The precedent holds: KG-4 lists posting functions and their audit events, and neither graph catalogues the ledger start-up events.

## Findings

### L-1 (Low): the two problem states are recorded only in the audit log and console, unlike the ledger start-up check

- **Where:**
  - `init.js:318-322` (`stock_return_receipts_table_missing`).
  - `init.js:361-366` (`stock_return_receipts_lock_blocked`).
  - Precedent: `moneyIntegrityService.js:172-173` and `:183`.
- **Trace.**
  - The existing start-up and lock problems are surfaced to the owner by the Money integrity check (Health Center):
    - It reads the latest `ledger_startup_check_failed` entry (`:183`).
    - It re-checks `missingLedgerGuards` and `unexpectedLedgerTriggers` live (`:172-173`).
    - It folds them into `ok`.
  - The two new problem states are written only to `console.error`, which the packaged Electron app does not show, and to the audit log.
  - The cost of each state:
    - With the unique index off, later returns can count a duplicated receipt twice. The correctness response accepts this on the grounds that "Start-up now reports them, so the owner can remove them before posting".
    - With the table missing, supplier returns cannot post.
  - Nothing in the app brings either state to the owner's attention.
- **Fix.**
  - In `moneyIntegrityService`, add a live return-receipts lock check and fold it into `ok`. It is a services-layer read and not a posting change. The check covers:
    - the table exists;
    - the trigger and the unique index match the definitions;
    - the duplicates query is empty.
  - Alternatively, read the latest `lock_blocked` and `table_missing` entries, as `:183` does.
  - Export the check from `init.js`, or move the definitions into a small module like `ledgerGuards.js`, so the service and the start-up step share one definition.

### L-2 (Low): `table_missing` is written on every start, but the policy says it is reported once per change

- **Where:**
  - `init.js:319-321`: no comparison with the last entry.
  - Policy §6 `:83`: "...named in the audit log, once per change, instead of stopping the app; a missing table is reported the same way."
- **Trace.**
  - Once 039 has run, each start with the table missing or replaced appends a new, identical entry.
  - `lock_blocked`, by contrast, compares with its last entry. The policy groups the two together.
  - The test (`return-receipts.test.mjs:326`) checks only that the entry exists after one start.
  - This is the repeated-entry shape that 47f21e7 M-1 and 78f71da L-1 already fixed for the other two actions.
- **Fix.**
  - Apply the same "write only if `new_value` differs from the last `table_missing` entry" check.
  - Alternatively, change the policy wording to say it is written on each start.
  - Reopen twice in the test.

### I-1 (Info): "once per change" keeps no record that a problem cleared

- **Where:** `init.js:364-365`.
- **Observation.**
  - A problem that is cleared writes nothing.
  - If the same problem then returns, its `new_value` equals the last entry, so the recurrence is not logged.
  - A reader of the audit log cannot tell "still blocked" from "cleared, then blocked again".
  - `ledger_startup_check_failed` avoids this by comparing with the state before the start, not with the last log entry.
- **Suggested.** When a problem clears (there is a last `lock_blocked` entry but no problem now), write a `{ duplicates: [], nameConflicts: [] }` entry. Then "differs from the last entry" means a real change.

### I-2 (Info): the sweep's allow-list is one name

- **Where:** `init.js:330-336`.
- **Observation.**
  - Every trigger on the table, or whose SQL names `stock_return_receipts`, is dropped at start, except `trg_stock_return_receipts_no_update`. That is correct today.
  - A future app-defined trigger would be removed at every start. One example is a delete guard on `stock_returns` that references the table. It would be removed and an audit entry written, and nothing would point the developer here.
  - `ledgerGuards.js` keeps its allow-list as an exported constant (`LEDGER_GUARD_TRIGGERS`) next to the definitions.
- **Suggested.** Turn the single name into a `RETURN_RECEIPTS_TRIGGERS` list beside `RETURN_RECEIPTS_LOCK_SQL`, with a one-line comment that any app trigger touching the table must be added there.

## Observation outside this diff (not a finding)

- KG-4 `compatibility.DG-1` still reads "v1.0.0 - ...". It has been stale since DG-1 1.1.0. The registry matrix (`^1.0`) is what the verifiers check, so nothing fails. Refresh it the next time KG-4's header is touched.

## Counts

- High: 0
- Medium: 0
- Low: 2
- Info: 2
