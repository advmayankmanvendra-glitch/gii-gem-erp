# In-house audit, pass 3: architecture, commit 91e2fa1 (return-receipts table)

- Date: 16 Nov 2026, 12:05 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `91e2fa1` on top of main `2c79106`
- Scope:
  - fit with existing patterns: `runMigration`, paise columns, reset classification;
  - the knowledge graphs DG-1 and KG-4;
  - accuracy of policy §6 and the code comments;
  - the AGENTS.md rules.

## Verdict

- **One Medium finding:** the knowledge graphs were not updated.
- **Two Low findings:** wording in the docs and comments, and migration numbering.
- Otherwise the change follows the house patterns.

## Fits existing patterns

- **Migration.** It uses `runMigration` with a named constant, in one transaction, and is added to the pre-upgrade backup check. That check is still a hand-kept list; see security L-3.
- **Money columns.** `value_minor INTEGER` follows the paise shadow-column convention. `quantity` and `rate` are `REAL`, as in `stock_ledger`.
- **Reset classification.** The table is in `RESET_TABLES` under Inventory, before its parents, so the `unclassifiedCompanyTables` guard is satisfied. The reset probe clears it with no FK issue.
- **Placement.**
  - All logic is in `inventoryService.js` (main process).
  - There are no renderer, IPC or preload changes. That satisfies AGENTS.md §2 (no business logic in App.jsx or the renderer), §4 (no IPC or preload renames) and §8 (no generic UI writes to sensitive tables). The table is outside `ALL_TABLES`.
  - The schema change the owner approved on 16 Nov is recorded in policy §6, as §4 requires.
- **Supporting index.** `idx_stock_ledger_source` is the X2/V3 fix recommended in audit-8d5dd67. No duplicate index exists.
- **Tests.** The new test file is added to `test:integrity`, and `lint:syntax` already covers `inventoryService.js` and `init.js`.

## Findings

### M-1: the new table is registered in neither the database graph (DG-1) nor the voucher and accounting graph (KG-4)

- **Where:**
  - `src/renderer/knowledge/database-graph.json` (DG-1). It has 74 tables; the `statistics.totalTables`, `relationships` and `migrationMappings` sections have no `stock_return_receipts` and no migration `039`.
  - `src/renderer/knowledge/voucher-accounting-graph.json:702-717` (KG-4, `postStockReturn`):
    - `readsFromTables` and `writesToTables` (`:706`, `:707`) do not list `stock_return_receipts`;
    - `relatedDG1Tables` (`:715`) does not either;
    - `safetyRule` (`:717`) still says "Earlier returns are replayed by quantity in posting order …", with no mention of the record or the backfill.
- **Why it matters:**
  - DG-1 has so far listed every table, including small internal ones such as `ledger_maintenance`, `opening_balances` and `goods_receipt_items`.
  - KG-4 was updated in the last PR #4 rounds (`a8c64af`, KG-4 goods receipts) whenever posting behaviour changed.
  - The ERP Brain and the help assistant answer from these graphs. A question like "which receipts did this return clear?" or "what does posting a supplier return write?" would get the pre-change answer.
  - No verifier compares DG-1 with the live schema, so this drift passes `test:integrity` silently.
- **Fix:**
  - **DG-1:** add the table entry: columns, category Inventory, owning module inventory, schemaVersion 039.
  - **DG-1:** add relationships to `companies`, `stock_returns`, `stock_ledger` and `stock_inwards`.
  - **DG-1:** add the migration mapping `039 stock_return_receipts` and bump `statistics` and the graph `version`.
  - **KG-4:** add the table to `readsFromTables`, `writesToTables` and `relatedDG1Tables` for `postStockReturn`. In one sentence of `safetyRule`, say that each return records its receipts and that earlier returns with a record are not replayed.
  - Run `scripts/verify-database-graph.js` and `scripts/verify-voucher-accounting-graph.js`.
  - Consider a small check that every table in `sqlite_master` appears in DG-1.

### L-1: the policy and the code comments claim more than the change delivers

- **Where:**
  - `docs/architecture/fsr-2a4-perpetual-inventory-policy.md:90`: "once recorded, it keeps the billing it had when it posted".
  - Policy `:93`: "Closed … V4 (a recorded return keeps its own billing) and the replay's dependence on row order for recorded returns".
  - `src/main/database/init.js:699-700`: "so later returns, reversals and restores never re-work it out".
- **What is wrong:**
  - **V4.** It is closed only for returns posted after the upgrade. A pre-upgrade return that posted no voucher is backfilled with the billing in force *at backfill time*, and that is then fixed for good. Correctness L-1 reproduces this (W2: GRNI −1,000 / PPV +1,000).
  - **Row order.** Recorded rows point at `stock_ledger.id`, and the replay still orders takes, gives and drops by stock-ledger ids (`inventoryService.js:455-468`). A restore that renumbered rows would now break the records outright. Every current restore path is a file copy that keeps ids, so nothing goes wrong in practice; the claim is overstated, not harmful.
  - **The comment.** Reversals never used the replay; they mirror the stock rows and the voucher. Restores keep ids, so they never re-worked anything either.
- **Fix:**
  - Reword `:90` and `:93` to: "for returns posted from 16 Nov 2026; a return posted earlier is recorded with the billing in force when it is backfilled", and drop the row-order sentence. Or adopt the eager backfill in correctness L-1(a) and keep the wording.
  - Trim the `init.js` comment to "so later returns use them instead of working them out again".

### L-2: migration 039 skips 037 and 038 with no note

- **Where:** `init.js:724` (`"039_stock_return_receipts"`). The last migration on this branch is 036. The 10 Nov convergence audit notes that the ACC programme adds 037; nothing anywhere mentions 038.
- **Scenario:** a later author on this branch picks 037 or 038 for an unrelated change, and it collides with ACC when the branches converge. Or someone takes the gap for a lost migration.
- **Fix:** add one comment line by the constant, for example: "037 is taken by the ACC programme and 038 is held for …; next free: 040". Or record the reservation in the convergence audit's migration section.

## AGENTS.md checklist

| Rule | Result |
|---|---|
| §2 App.jsx protection / no renderer business logic | Pass: no renderer changes |
| §4 Preserve core logic (schema, IPC, preload names) | Schema change approved by the owner (16 Nov) and recorded in policy §6; IPC and preload untouched |
| §5 Reuse before creating a table | Justified: the replay was the existing mechanism, and the owner chose the stored allocation |
| §8 Sensitive tables not written from generic UI | Pass: outside `ALL_TABLES` and `WRITE_POLICY` |
| §9 Company context | Pass: `company_id` is always the return's company |
| Knowledge graphs kept in sync | **Fail: see M-1** |
