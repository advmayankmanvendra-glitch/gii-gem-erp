# In-house audit, pass 1: correctness, commit 78f71da (return-receipts lock step)

- Date: 16 Nov 2026 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `78f71da`
- Scope: `git diff fc8a413..78f71da`, read against `audit-fc8a413-correctness.md` and `responses-fc8a413.md`. This covers `ensureReturnReceiptLocks` in `src/main/database/init.js`, the new and changed tests in `scripts/audit/return-receipts.test.mjs`, and the related doc and graph text.
- Method:
  - Code reading.
  - Probes and mutants run on a copy of `78f71da` exported with `git archive` into the session scratchpad, with node_modules linked. The copy was deleted afterwards. Nothing in the repo was edited, and the working tree was clean at `78f71da`.
  - `return-receipts.test.mjs` passes 17/17 at `78f71da`.

## Verdict

- **Both findings from the last pass are closed (L-1, I-1).**
- **Accounting and pricing code is unchanged in this diff.** `inventoryService.js` is not touched.
- **One Low (L-1):** two tampered locks are not handled as claimed.
  - A *partial* unique index with the right name and columns passes the shape check, and enforces nothing.
  - A repaired lock trigger, or a re-made missing index, writes no audit entry, although the response says the step logs whenever it changes anything.
- **One Info (I-1):** a file with duplicate rows adds an audit entry on every start, and posting keeps counting the duplicate. Only an edited file can reach this.

## Previous findings

### L-1 (the migration-list test missed some call shapes): closed

- The test (`:130`) now takes the names a fresh database records in `schema_migrations`, plus every quoted `NNN_name` string in `src/main/database/*.js`. It then requires each name from 036 on to be in `MIGRATIONS_WITH_BACKUP`.
- Each of these mutants now fails the test:

| Mutant on the archive copy | Result |
|---|---|
| `runMigration(\n db,\n "040_probe", …)` written over several lines | fails |
| `runMigration(database, "040_probe", …)` | fails |
| `` runMigration(db, `0${n}_probe`, …) ``, a template name (caught by the fresh-database names) | fails |
| `039` removed from `MIGRATIONS_WITH_BACKUP` | fails |

### I-1 (duplicate rows stopped every start, after the ledger guards were dropped): closed

- The lock step left `migrate` and now runs in `initializeDatabase` right after `ensureLedgerGuards` (`init.js:295-296`).
- It checks for duplicates before it makes the unique index (`:337-339`), and with duplicates it leaves the index off instead of throwing.
- Test "duplicate recorded rows in a file do not stop the app from starting" (`:276`) fails at `fc8a413`, because `initializeDatabase` throws there.
- `initializeDatabase` is the only caller of `migrate` (checked with grep across `src` and `scripts`). So no path runs migrations without the lock step. The step was removed from `migrate` in this diff.

## ensureReturnReceiptLocks: what was checked

- **Start-up order:**
  - New database: 039 creates the table, then the lock step creates both indexes and the trigger, and writes no audit entry.
  - Databases from 91e2fa1 and from 47f21e7 to fc8a413: missing objects are made, and matching ones are kept.
  - No step between `migrate` and the lock step writes to `stock_return_receipts`.
- **Transaction:**
  - Drops, re-creates and the duplicate query all run in one `db.transaction` (`:323-343`).
  - `auditLog` runs after the commit, so a failed audit write cannot undo the locks.
  - Nothing that can throw in normal use was found.
- **Mutants:**

| Mutant | Result |
|---|---|
| `CREATE TRIGGER IF NOT EXISTS` (a tampered trigger with the same name is kept) | test 16 fails |
| duplicate check skipped | test 17 fails |
| lock step moved before `ensureLedgerGuards` | 17/17 pass |

- The last mutant does no harm now that the step does not throw on duplicates. It does mean the order is not pinned by a test.

## Findings

### L-1: a partial unique index passes the shape check, and two kinds of repair leave no audit entry

- **Where:** `init.js:316-320` (`indexShape` reads only `unique` and column names from `PRAGMA index_list` / `index_info`), `:325` (the lock trigger is always dropped and re-made, unrecorded), and `:334-336` (an index is recorded only when one with that name already existed).
- **Probes (archive copy, three restarts each):**

| Tamper in the file | After restart | Audit entries |
|---|---|---|
| `CREATE UNIQUE INDEX idx_stock_return_receipts_unique ON stock_return_receipts(stock_return_id, stock_ledger_id) WHERE 0` | a duplicate `(stock_return_id, stock_ledger_id)` insert is **accepted** | 0 |
| lock trigger replaced by `… WHEN 0 BEGIN SELECT 1; END` | update refused (repaired) | **0** |
| unique index dropped | duplicate insert refused (re-made) | **0** |

- **Effect:**
  - With the partial index, the "one row per receipt per return" lock is gone, and every start says it is in place.
  - The response to the last pass says the step "writes `stock_return_receipts_locks_restored` to the audit log when it changed anything". For an altered lock trigger or a missing index it does not, so a file that came back with its locks removed leaves no trace.
- **Severity:** Low. It needs an edited or restored file, and amounts are not affected by the trigger or index alone.
- **Fix:**
  - In `indexShape`, also require `entry.partial === 0` and `entry.origin === 'c'`. Simpler still, compare the normalised `sqlite_master.sql` of each index and of the trigger with the expected text, as `ensureLedgerGuards` does with `normalizedSql`.
  - Record a trigger in `found` when its SQL differed or it was missing. Record an index when it was missing on a database that already had 039 applied before this start.
  - Add a test with a partial index and a test with only the lock trigger altered.

### I-1: duplicate rows keep posting wrong and write an audit entry every start

- **Where:** `init.js:337-339` and `:345-347`; `inventoryService.js:462`.
- **Scenario (probe):**
  - A file holds two rows for the same return and receipt.
  - Each start adds one more `stock_return_receipts_locks_restored` entry (1, 2, 3 after three starts), and the unique index stays absent.
  - The console line says the locks "have been put back", which is not true for the unique index.
- **Effect on amounts:**
  - `recordedUse` maps every recorded row, so the duplicate's units are taken from that receipt twice.
  - Later returns for that supplier and item then price as if the receipt were smaller: more GRNI or Trade Payables at the next receipt, or more at average cost past the receipts.
- **Why Info:** no code path writes such rows (see the last pass), and naming them on every start may be intended as an alert. Raised so the trade-off is a decision.
- **Fix (optional):**
  - Word the console line for the duplicate case, for example "the unique index is left off: duplicate rows".
  - Flag the return in the Money integrity check or Health Center.
  - Optionally make `recordedFor` de-duplicate by `stock_ledger_id`.

## Other checks (no findings)

- The trigger clean-up removes every other trigger whose `tbl_name` is the table.
  - A trigger on another table that deletes return-receipt rows survives. Probe: `AFTER INSERT ON stock_returns … DELETE FROM stock_return_receipts`.
  - That is a tamper scenario for the security pass, and it is outside what the comment claims.
- **Test validity.**
  - Test 16 checks the update refusal, the trigger list, the UNIQUE refusal, and the audit lists for the planted trigger and the rebuilt index.
  - Test 17 checks that start-up succeeds, that the guards are back, and the logged duplicates.
  - Both use the real start-up path, and each fails against its own mutant.
- **Docs and graphs:** the policy §6 and DG-1 notes match the code. The KG-4 line numbers I checked match `78f71da`, for example `postLedgerEntry` at 1362 and `markPosted` at 1460.
