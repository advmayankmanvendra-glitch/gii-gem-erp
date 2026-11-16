# In-house audit, pass 4: architecture, commit fc8a413 (return-receipts fix round 2)

- Date: 16 Nov 2026 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `fc8a413`
- Scope: `git diff 47f21e7..fc8a413`, read against `audit-47f21e7-architecture.md` and `responses-47f21e7.md`.
- Method:
  - Code reading, git history of DG-1's `version`, and a script that checks every KG-4 `lineNumber` against its source file.
  - `verify-database-graph.js`: 32 passed, 0 failed. `verify-voucher-accounting-graph.js`: all checks passed. `verify-governance-graph-registry.js`: 53 PASS, 1 INFO, 0 FAIL.
  - Read-only. No repo files edited, no installs.

## Verdict

- The previous architecture findings are closed: L-1, L-2 and L-3 (the order and date parts). Details below.
- **No High or Medium findings.**
- **Two Low findings:**
  - L-1: the reason given for not bumping DG-1's `version` does not match the registry or the repo's history.
  - L-2: one DG-1 sentence was missed when the "a return that used no receipt" wording was fixed.
- **One Info finding:**
  - I-1: the start-up DDL is sound, but it is placed and written differently from the repo's existing start-up guard pattern.

## Previous findings: closure check

| 47f21e7 finding | Status | Evidence |
|---|---|---|
| L-1: seven KG-4 line numbers stale | Closed | All 23 KG-4 `lineNumber` values now point at their function's declaration line, including `postStockReturn` at 511, `postExpenseAccrualsForOrder` at 1702, `postLedgerEntry` at 1324, `updateCashBankLedger` at 1339, `upsertReceivable` at 1710, `refreshReceivable` at 1735 and `markPosted` at 1422. The optional verifier check was not added, so this can drift again (see the note under I-1). |
| L-2: wording claims more than the code delivers | Closed in policy §6, `init.js` and KG-4 | Policy `:83` now says "a trigger refuses any update to them (only the operational reset deletes them...)" and "a return that used no receipt has nothing to record". The KG-4 `safetyRule` (`:717`) and the `init.js` comment (`:701-702`) carry the same caveat. Security L-1 is closed by the start-up DDL, so "rows cannot be updated" now holds on every database. DG-1 `notes` was missed: see L-2 below. |
| L-3: entry order and metadata | Closed except `version` | The three relationships are now at the end of `relationships` (`database-graph.json:11600-11627`). The 039 mapping is last in `migrationMappings` (`:12818-12825`), so the order runs 001 ... 035, 039. `metadata.lastValidated` is `2026-11-16` (`:13248`). The `version` was not changed, and the response explains why. See L-1 below. |

## Checked and found sound

- **Trigger and index outside migration 039 (`init.js:724-731`).**
  - Migration 039 at `91e2fa1` created only the table and `idx_stock_return_receipts_return`. It had neither the unique index nor the trigger. Because 039 is recorded as applied, moving DDL into the migration body could never reach those databases. Running idempotent `IF NOT EXISTS` DDL on every start is the right tool.
  - The repo already does this. `migrate()` starts with a baseline `CREATE TABLE IF NOT EXISTS` block that runs on every start (`init.js:308`). `ensureLedgerGuards` (`ledgerGuards.js:373`) also recreates indexes and triggers on every start.
  - **Order.** The block runs after `runMigration(RETURN_RECEIPTS_MIGRATION)`, so the table always exists by then.
  - **Backup.** The block is purely additive, so it does not need a place in `MIGRATIONS_WITH_BACKUP`.
  - **Ledger guards.** `dropUnexpectedLedgerTriggers` will not remove the new trigger. Its table is not in `LEDGER_TABLES` (`ledgerGuards.js:75`), and its SQL does not name any ledger table.
  - **Unique index on old data.** `CREATE UNIQUE INDEX` would stop start-up if a `91e2fa1` database held duplicate `(stock_return_id, stock_ledger_id)` pairs. The `91e2fa1` `take()` pushes each lot at most once per return (the lot sits in exactly one group). Backfill wrote only returns with no record. No path that writes duplicates was found.
  - **Test.** The new start-up test drops the trigger and the index and checks that they come back.
- **Migration-list test.**
  - It now resolves constants across `src/main/database/*.js`, so `FSR2B1_MIGRATION_NAME` from `accountMappingRegistry.js` is found.
  - It matches only lines that call `runMigration` and fails on a name it cannot read. This closes the gap.
- **`inventoryService.js:479-480`.**
  - The empty-backfill filter is a change to the service layer only. It changes which audit entries and rows are written, not the voucher lines.
  - It touches no posting amounts, IPC channels, preload methods or route keys.
  - Nothing moved into `App.jsx` or into the screens.
- **The `recordReturnReceipts` comment (`:493-496`).** It now matches what the voucher does. Units past every receipt go to Trade Payables at WAC and have no row.
- **DG-1 hand formatting.**
  - The diff moves blocks unchanged and edits one metadata line.
  - The counts still match `statistics`: 75 tables, 60 relationships, 17 migration mappings.
- **Policy §6.** It agrees with the code and with KG-4 on what is locked (UPDATE only), on what deletes rows (the reset only) and on what is recorded (only returns that used receipts).

## Findings

### L-1 (Low): the reason for not bumping DG-1's `version` contradicts the registry and the repo's history

- **Where:**
  - `responses-47f21e7.md`, the "Answered, not changed" section.
  - `database-graph.json:5` (`"version": "1.1.0"`).
  - `repository/graph-registry.json:54`, `:110`, `:195`.
- **The response says:**
  - DG-1's `version` "tracks schema changes to the graph file itself (fields, index object shape), not new entries".
  - Migrations 033 to 036 were added "without a bump".
- **What the repo shows:**
  - The file-schema version is a separate field: `schemaVersion: "1.0.0"` (`database-graph.json:2`, registry `:213`). The registry states that `version` is the **data** version: "graph data versions are recorded separately in each graph record and compatibilityMatrix version field" (`graph-registry.json:54`).
  - Commit `88fa2b6` (migration 035, FSR-2B.1) added four tables in the existing shape. `schemaVersion` stayed 1.0.0, yet it bumped `version` from 1.0.0 to 1.1.0. Migration 035 falls inside "033 to 036", so the stated precedent is wrong for that range.
  - Commit `2b0f979` added `ledger_maintenance` (73 to 74 tables) without a bump. Practice is therefore mixed, and the convention is written down nowhere.
- **Impact.**
  - Keeping 1.1.0 breaks nothing. No verifier or consumer compares the value. `featureFunctionBridge.js:238` only displays it.
  - The cost is the record. The recorded rationale redefines `version` against the registry's own definition, and a later author following it will be inconsistent with `88fa2b6`. `generatedAt` (`:6`, `2026-07-29`) is also stale, so a reader has no version or date signal that DG-1 changed for 039, except `lastValidated`.
- **Fix (either):**
  - **(a)** Bump DG-1 to `1.2.0` in all three places that must agree: `database-graph.json:5`, `graph-registry.json:195` and `compatibilityMatrix` `:110`. `verify-governance-graph-registry.js:200` checks that the matrix matches. Set `generatedAt` as well.
  - **(b)** Keep 1.1.0, but write the convention where readers will find it, for example "data `version` changes only on a shape-compatible restructure; new tables do not bump it". Put it in the Version Policy of `docs/architecture/enterprise-intelligence-layer.md` (`:89-96`) or next to `graph-registry.json:54`. Then correct the response's rationale and precedent so the audit record is accurate.

### L-2 (Low): the DG-1 table note still says every pre-039 return is recorded by replay

- **Where:** `database-graph.json:7615` (`stock_return_receipts.notes`): "Returns posted before migration 039 are recorded by replay when the next return for the same supplier and item posts (recorded_by = backfill)."
- **Why.**
  - The commit narrowed this claim in policy §6 `:83`, in the KG-4 `safetyRule` `:717` and in the `init.js:701-702` comment.
  - In the code, a pre-039 return that used no receipt is never recorded (`inventoryService.js:480`, `e.entry.used.length`).
  - DG-1 is the graph an assistant reads for table semantics, and it now disagrees with the other three.
- **Fix.** Append "; a return that used no receipt has nothing to record" to that sentence. Values-only edit, no reformatting.

### I-1 (Info): the start-up lock is sound but sits apart from the repo's start-up guard pattern

- **Where:** `init.js:724-731`, compared with `ensureLedgerGuards` (`ledgerGuards.js:373-404`), which `initializeDatabase` calls at `init.js:295`.
- **Observation.**
  - The repo's established every-start guard (`ensureLedgerGuards`) is a named function called from `initializeDatabase`. It runs in a transaction and drops and recreates its triggers, so an altered trigger with the same name is replaced. It compiles them. `missingLedgerGuards` lets the integrity check report drift while the app runs.
  - The new block is an anonymous `db.exec` at the tail of `migrate()`, a function otherwise organised around `runMigration`. Its `CREATE TRIGGER IF NOT EXISTS` restores a trigger that is missing. It leaves in place a trigger of the same name whose body was changed, for example by a restored backup. No runtime check reports the lock missing.
  - For a non-ledger audit table this is proportionate, so it is not a defect.
- **Suggested, when this area is next touched:**
  - Move the block into a small `ensureReturnReceiptLocks(db)`, called from `initializeDatabase` next to `ensureLedgerGuards`.
  - Use `DROP TRIGGER IF EXISTS` and then `CREATE TRIGGER`, so the definition is always current.
  - Optionally, have the integrity check report a missing lock.
- **Related.** KG-4 line numbers have now needed a refresh in two consecutive rounds. A check in `verify-voucher-accounting-graph.js` that line `lineNumber` contains `function <functionName>` would stop this recurring. A 10-line script confirmed that all 23 entries currently pass.

## Counts

- High: 0
- Medium: 0
- Low: 2
- Info: 1
