# In-house audit, pass 3: architecture, commit 47f21e7 (return-receipts fix round)

- Date: 16 Nov 2026, 12:30 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `47f21e7`
- Scope: `git diff 91e2fa1 47f21e7`, read against `audit-91e2fa1-architecture.md` and `responses-91e2fa1.md`.
  - DG-1: `src/renderer/knowledge/database-graph.json`.
  - KG-4: `src/renderer/knowledge/voucher-accounting-graph.json`.
  - `repository/graph-registry.json`.
  - Policy §6: `docs/architecture/fsr-2a4-perpetual-inventory-policy.md`.
  - The `init.js` comments.
- Method:
  - Code reading, plus scripted checks of graph counts and line numbers against the source.
  - `verify-database-graph.js` reports 32 passed and 0 failed. `verify-voucher-accounting-graph.js` passes. `verify-governance-graph-registry.js` reports 53 PASS and 0 FAIL.

## Verdict

- Architecture M-1 of 91e2fa1 is closed: DG-1 and KG-4 now know the table.
- Architecture L-1 and L-2 of 91e2fa1 are closed: the wording and the migration-numbering note.
- **No High or Medium findings.**
- **Three Low findings:**
  - L-1: stale KG-4 line numbers.
  - L-2: wording that claims a little more than is true.
  - L-3: entry order and metadata dates.

## Checked and found sound

- **DG-1 table entry.**
  - The 11 columns match the `CREATE TABLE` at `init.js:707-719`: names, types, nullability, the PK, and four foreign keys.
  - Both indexes are listed, with the right `unique` flags.
  - `genericCrudAllowed: false` matches `ALL_TABLES`. `hasSoftDelete: false` is right.
  - The entry is placed in name order next to `stock_returns`.
- **DG-1 counts.**
  - `statistics` reads totalTables 75, totalRelationships 60 and totalMigrationMappings 17. The arrays hold 75, 60 and 17 entries.
  - The registry's DG-1 `entryCount` is 75.
- **Relationships.**
  - Three were added: to `stock_returns`, `stock_ledger` and `stock_inwards`. There is none to `companies`, which matches the file's convention: only 10 of the 59 tables with a company FK have a relationship row.
- **Other DG-1 edits.**
  - The `stock_ledger` index entry (`idx_stock_ledger_source`) is correct.
  - The inventory service mapping and the `postStockReturn` reads and writes now list the table.
- **Minimal.**
  - DG-1 has 194 insertions and 7 deletions. Each deletion is an intended edit: `indexes: []`, one array tail, two read and write lists, two statistics lines and one migration count.
  - The one-line index objects follow the file's existing style (for example `:10778`). No unrelated reformatting was found, and the mojibake on the `cascadeBehavior` line predates the commit.
- **KG-4 `postStockReturn`.**
  - `readsFromTables`, `writesToTables` and `relatedDG1Tables` list the table.
  - `transactionBoundary` mentions the record.
  - `safetyRule` now says that recorded returns are taken as they are and that unrecorded ones are replayed and then recorded.
- **Policy §6 and `init.js`.**
  - V4 is now claimed only for returns posted from 16 Nov 2026, and the backfill caveat is stated (`:90`, `:93`).
  - The row-order sentence is limited to returns posted from then on.
  - The `init.js` comment no longer claims anything for reversals or restores.
  - The 037/038 note is present (`init.js:704`).

## Findings

### L-1: seven KG-4 line numbers are stale. This commit set them to 91e2fa1's positions and then shifted the code.

- **Where:** `voucher-accounting-graph.json`:

| Function | Entry | Line in KG-4 | Line at 47f21e7 |
|---|---|---|---|
| `postStockReturn` | `:704` | 501 | 508 |
| `postExpenseAccrualsForOrder` | `:542` | 1689 | 1697 |
| `postLedgerEntry` | `:560` | 1311 | 1319 |
| `updateCashBankLedger` | | 1326 | 1334 |
| `markPosted` | | 1409 | 1417 |
| `upsertReceivable` | | 1697 | 1705 |
| `refreshReceivable` | | 1722 | 1730 |

- **Check.** Each number equals the function's line at `91e2fa1`. The commit's own `init.js` edits added 8 lines above them, and its `inventoryService.js` edits added 7. The other 16 KG-4 entries are correct.
- **Scenario.** A reader, or the ERP Brain citing KG-4, opens `inventoryService.js:501`. That line is inside `recordReturnReceipts` (`const minor = …`), not the posting function. No verifier compares line numbers, so this passes `test:integrity`.
- **Fix:**
  - Set the seven values in the right-hand column.
  - Optionally add a check to `verify-voucher-accounting-graph.js` that each `lineNumber` holds `function <functionName>(`. A 10-line script found all seven.

### L-2: a few sentences still claim slightly more than the code delivers

- **Policy §6, `:83`: "a trigger refuses any change to them".**
  - The trigger refuses UPDATE only. DELETE is allowed, by design, for the reset (`init.js:722`; the response says so too).
  - Deleting a return's rows is a change. It also quietly reopens V4 for that return, which is backfilled with the billing in force at the next posting.
  - On a database that ran migration 039 at `91e2fa1`, there is no trigger at all (security L-1).
  - **Suggested:** "a trigger refuses any update to them (only the operational reset deletes them)", together with the security L-1 fix.
- **DG-1 `notes`, `:7615`: "rows cannot be updated".** This is true wherever the trigger exists. Keep it, and fix security L-1 so that it is true everywhere.
- **KG-4 `safetyRule`, `:717`: "an earlier return with no record yet (posted before migration 039) is replayed … and then recorded".**
  - A return that used no receipts is never recorded. It is replayed on every later posting (correctness M-1).
  - A return posted by an older build after the upgrade is in the same position.
  - **Suggested:** "(posted before migration 039, or one that used no receipt)", and drop "and then recorded" for the second case.

### L-3: new DG-1 entries are placed at the top of two lists, and the graph's own metadata dates were not updated

- **Where:**
  - `database-graph.json:12655-12663`: the `039` migration mapping comes first, before `001`. The order now runs 039, 001, 003 … 035.
  - `:11088-11114`: the three new relationships come first, before `supply_orders`.
  - `:13248`: `metadata.lastValidated` is still `2026-11-10` and `version` is still `1.1.0`, while the registry entry now says `lastUpdated: 2026-11-16`. The 91e2fa1 audit (M-1) asked for the graph `version` to be bumped.
- **Scenario.** Nothing reads the order today. A grep finds no `migrationMappings` consumer outside the JSON. But a reader, or a future "latest migration" lookup that takes the last element, sees 035 as the newest. A dated reader sees DG-1 validated before the table existed.
- **Fix:**
  - Move the 039 mapping to the end of `migrationMappings`.
  - Optionally move the relationships next to the other `stock_*` relationships.
  - Set `metadata.lastValidated` to `2026-11-16` and bump `version` to `1.2.0`, a schema addition.

## Observations outside this diff (not findings)

- **DG-1 `postingMappings` for `postStockReturn`** still says `createsVoucherType: null` and `ledgerImpact: false`, but a supplier return posts a Journal voucher. This predates 91e2fa1, though this commit edited the same entry. Worth fixing the next time DG-1 is touched.
- **The registry entry for KG-4** keeps `lastUpdated: 2026-07-14`, although KG-4 has been edited in several rounds. This is a long-standing pattern.
