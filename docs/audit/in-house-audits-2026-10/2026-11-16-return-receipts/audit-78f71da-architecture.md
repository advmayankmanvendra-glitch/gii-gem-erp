# In-house audit, pass 5: architecture, commit 78f71da (return-receipts fix round 3)

- Date: 16 Nov 2026 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `78f71da`
- Scope: `git diff fc8a413..78f71da`, read against `audit-fc8a413-architecture.md` and `responses-fc8a413.md`.
- Method:
  - Code reading.
  - A script that checks each KG-4 `lineNumber` against its source file. All 23 entries match.
  - Graph verifiers, all passing:

| Verifier | Result |
|---|---|
| `verify-database-graph.js` | 32 passed, 0 failed |
| `verify-voucher-accounting-graph.js` | All checks passed |
| `verify-governance-graph-registry.js` | 53 PASS, 1 INFO, 0 FAIL |
| `verify-audit-graph.js` | 27 passed, 0 failed |

- Read-only.

## Verdict

- All three of my fc8a413 findings (L-1, L-2 and I-1) are closed.
- **No High or Medium findings.**
- **One Low finding:**
  - L-1: on the duplicate-rows path, the start-up message is wrong, the audit entry repeats on every start, and the DG-1 note does not mention the exception.
- **Two Info findings:**
  - I-1: DG-1 `generatedAt` was not moved with the version bump.
  - I-2: where start-up and backfill audit events are, and are not, catalogued.
- **Coordinator's question: should DG-1 or KG-4 mention `ensureReturnReceiptLocks` anywhere else?** No.
  - The DG-1 table note is the right and only place.
  - KG-4 lists posting functions, and this is not one.
  - Neither graph catalogues start-up functions or triggers: `ensureLedgerGuards` is named in no knowledge graph, and DG-1 defers trigger mapping to `DG-1.3` (`:13222`).

## Closure of fc8a413 findings

| Finding | Status | Evidence |
|---|---|---|
| L-1: DG-1 version answer | Closed | `version` is `1.2.0` in all three places: `database-graph.json:5`, `graph-registry.json:195` and compatibility matrix `:110`. The registry verifier's matrix check passes. The response withdraws the earlier rationale and cites the registry definition and `88fa2b6`. |
| L-2: DG-1 note | Closed | `database-graph.json:7615` now ends "a return that used no receipt has nothing to record". |
| I-1: start-up lock placement | Closed | See the table below. |

How `ensureReturnReceiptLocks(db)` (`init.js:314-351`) closes I-1:

| What I-1 asked for | What the new code does |
|---|---|
| A named start-up function next to `ensureLedgerGuards` | It is called from `initializeDatabase` right after `ensureLedgerGuards` (`init.js:295-296`). |
| The trigger always current | It drops and recreates the trigger unconditionally (`:324-326`). |
| No foreign triggers left on the table | It drops other triggers whose `tbl_name` is the table (`:322-323`). |
| Indexes that match the app's definition | It checks both indexes' uniqueness and columns through `PRAGMA index_list` and `index_info`, and rebuilds them when they differ. |
| Changes recorded | It writes an audit entry when anything changed. |

The old anonymous block at the end of `migrate()` is gone, so `migrate()` is migrations again.

## Checked and found sound

- **Every open goes through it.** Each database open in `main.js` uses `initializeDatabase`: start (`:393`), restore and reset reopens (`:1179`, `:1189`, `:1492`, `:1504`, `:1554`). A restored file therefore gets its locks back before use.
- **Ordering.** The function runs after migrations, `ensureAuditChain`, seeding and the ledger guards, so `auditLog` writes into a chained, guarded database. `audit_log` is not one of the ledger guards' `LEDGER_TABLES`.
- **Safety.**
  - It returns early when the table is absent (`:315`).
  - DDL runs in one transaction.
  - Identifiers are fixed constants, apart from trigger names read from `sqlite_master`, which are quoted.
- **Policy §6 `:83`.** It describes the start-up step and the duplicate exception, and it matches the code. "Any other trigger on the table" is accurate: the drop is limited to `tbl_name = 'stock_return_receipts'`.
- **KG-4.** The six `init.js` line numbers moved by +38, which matches the 44 lines added above them less the 6 removed below. `postStockReturn` (`inventoryService.js:511`) is unchanged and correct.
- **Repo rules.** No IPC, preload or route-key change. No business logic in `App.jsx` or the screens. No posting or voucher-amount change.

## Findings

### L-1 (Low): duplicate-rows path, wrong message, repeated audit entry, and a DG-1 note that omits the exception

- **Where:**
  - `init.js:333-336` and `:345-348`.
  - `database-graph.json:7615`.
- **Trace.**
  - When duplicates exist, the unique index is not created (`continue` at `:336`) and `report.duplicates` is non-empty.
  - Two things then go wrong:
    1. **The message is wrong.** `console.error` says "the record's locks were altered in this file **and have been put back**" (`:346`). The unique index has not been put back.
    2. **The audit entry repeats.** Nothing clears the duplicates, so every later start finds the index missing again. Each start writes the same `stock_return_receipts_locks_restored` entry and the same message. This is the "same audit entry on every run" shape that 47f21e7 correctness M-1 fixed for backfills.
  - The test (`return-receipts.test.mjs:276-291`) reopens only once, so it does not show the repetition.
  - The DG-1 note says "the lock trigger and unique index are put back on every start". Policy §6 states the exception, but DG-1 does not, so the two disagree.
  - Nothing outside the audit log, for example the money integrity check, reports that the unique index is off.
- **Impact.** Low. Duplicates arise only by editing the file. But the one state that needs a person's attention is reported under a "put back" label, and it is repeated until it is lost in the noise.
- **Fix:**
  - Report duplicates under their own action, for example `stock_return_receipts_duplicates_found`, with a message saying the unique index is off. Keep `locks_restored` for real repairs.
  - Write that entry only when the duplicate set differs from the last one logged, or say in the policy that it repeats on each start by design.
  - Add "(unless the file holds duplicate rows; see policy §6)" to the DG-1 note.
  - Optionally, have the integrity check report a missing `idx_stock_return_receipts_unique`.
  - Extend the test to reopen twice and assert the entry count.

### I-1 (Info): DG-1 `generatedAt` was not moved with the version bump

- **Where:** `database-graph.json:6`. It reads `"generatedAt": "2026-07-29T15:29:58.865Z"` while `version` is `1.2.0`.
- **Precedent.** The previous bump (`88fa2b6`) changed both fields together. My fc8a413 L-1 fix (a) suggested setting it.
- **Impact.** No verifier reads it. A dated reader sees a 1.2.0 graph generated before the table existed. `metadata.lastValidated` (`2026-11-16`) partly covers this.
- **Fix:** Set `generatedAt` to the commit date of the 1.2.0 change.

### I-2 (Info): which audit events the graphs catalogue (no change needed for the new function)

- **Start-up events.** Neither KG-4's audit-event list (`voucher-accounting-graph.json:~1660-1730`) nor AG-1 catalogues the existing start-up event `ledger_unexpected_triggers_removed`. Leaving out the new `stock_return_receipts_locks_restored` follows that precedent and is consistent.
- **Pre-existing gap since `91e2fa1`.** KG-4's events for `postStockReturn` (`:1707-1712`) list only "stock return posted". They omit `stock_return_receipts_backfilled`, which `postStockReturn` writes (`inventoryService.js:544`). Add it the next time KG-4 is touched.

## Counts

- High: 0
- Medium: 0
- Low: 1
- Info: 2
