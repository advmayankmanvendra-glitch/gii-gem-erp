# Area: data-safety (acf6d02)

## 1. Scope covered

Files I read in full: `src/main/services/{importValidationService, importParserService, tallyImportService, masterDataToolsService, safeDeleteService, operationalResetService, backup, supportBundleService, documentService, healthService}.js`, `src/main/services/deployment/{rollbackService, goLiveService}.js`, plus parts of `goLiveVerificationService.js`, `productionReadinessService.js`, `database/connection.js`, `init.js migrate()/runMigration/initializeDatabase`, `moneyMigration.js`, `schemaDefinitions.js addMoneyShadowColumns`, `domain/moneyCompatibility.js`, `reportBuilders.js minorAgg/minorVal/trialBalance`, `crudHelpers.js createRecord/updateRecord`, `authService.js enforcePermission/userForPermission`, the `main.js` IPC handlers for import, backup, reset, go-live, documents and health, `GoLiveWizard.jsx`, the renderer import confirm flows, and `deployment/certificate-history.json`.

Data-root isolation: `connection.js` uses the `GII_GEM_ERP_DATA_ROOT` override, and `initializeDatabase(root)` accepts a root. Every repro ran in its own `mkdtemp` directory, and I deleted each one afterwards. To get an old-era DB, I extracted aec83eb into `/tmp/claude-0/aud-work/data-safety/old` with `git archive` and symlinked `node_modules`.

Repro scripts are in `/tmp/claude-0/aud-work/data-safety/scripts/`: `old-db-upgrade.mjs`, `imports.mjs`, `dates-xlsx.mjs`, `backup-wal.mjs`, `golive.mjs`, `tally-dos.mjs`, `codex-4-5.mjs`.

Scripts I was asked to run. Each ran on its own, with cwd and the data root in a temp directory, because some of them write to cwd:

| Script | Result | Does it assert real outcomes? |
|---|---|---|
| `backup-restore-validation.js` | PASS (exit 0) | Yes, but narrowly. It inserts a marker after `createBackup`, restores, and checks the marker is gone. It never exercises `createLiveBackup` (the UI path), WAL contents, an open connection, the pending-restore lifecycle or validation. It also passes while F2 and F3 below are real. |
| `stability-edit-backup-smoke.js` | 29 pass, 0 fail (exit 0) | Mostly real CRUD and lock assertions. The backup test closes the DB before restoring, so it cannot see F2 or F3. |
| `verify-audit.js` | exit 2: 291 PASS, 1 FAIL, 4 INFO | It is a governance-graph and document-manifest audit, not a data test. The only FAIL is `GGR-1: Report manifest integrity mismatch` across almost every `reports/*.md`. That is probably copy or line-ending drift in this snapshot, not a code defect. It does not exercise import, backup or reset. |
| `verify-safe-delete.js` (extra) | 26/26 pass | Mostly source-text `includes()` checks plus a few FK lookups. It did not catch F9. |

There are no `verify-*import*` or `verify-*tally*` scripts. `scripts/tally-intelligence/*.cjs` are offline report generators, not verifiers.

## 2. Findings

| id | sev | status | file:line | defect | impact |
|---|---|---|---|---|---|
| F1 | P0 | REPRODUCED | init.js:656-658, schemaDefinitions.js:31-48, reportBuilders.js:8-14 | Migration 034 adds `*_minor` columns as `NOT NULL DEFAULT 0` with no backfill. Reports use `COALESCE(SUM(x_minor), legacy)`, which never falls back because the sum is 0, not NULL. | When an aec83eb-era DB upgrades, every pre-upgrade ledger, voucher, opening, carry-forward and stock amount reads as 0. The Trial Balance and Balance Sheet show 0. Stock value (`inventoryService.js:22`) is 0. Running-balance minors restart from 0. `backfillAll` exists but is never called, and `checkMoneyIntegrity` is dead code. |
| F2 | P1 | REPRODUCED | backup.js:34-56 (`createBackup`), used by operationalResetService.js:236,270 and deployment/rollbackService.js:6 | The pre-reset and go-live "safety" backup is a raw `fs.copyFileSync` of the main `.db` while the DB is open in WAL mode, with no checkpoint. | The recovery snapshot silently misses committed transactions that are still in the WAL. In the repro, 5 of 6 recent orders were missing. (Codex item 1: CONFIRMED.) |
| F3 | P1 | REPRODUCED (Linux) / CODE-TRACED (Windows) | main.js:1123-1125, 1089-1091; operationalResetService.js:325-347; rollbackService.js:35-60; backup.js:93-100 | `reset:rollback` and `go-live:rollback` call `restoreBackup` while the shared `db` handle stays open. The restore deletes `-wal`/`-shm`, copies over the file, and the handle is never closed or reopened. | On Linux it reports `{success:true}`, but the live handle keeps the reset state and writes its WAL back over the restored file. After reopening, 0 of the reset rows were active, so the rollback silently did nothing. On Windows the open WAL is locked, so the restore will most likely fail with EBUSY/EPERM after retries. Either way, reset and go-live cannot really be rolled back. (Codex item 2: CONFIRMED.) |
| F4 | P1 | CODE-TRACED | main.js:1077-1125 | `reset:execute`, `reset:execute-enhanced`, `reset:rollback`, `go-live:execute` and `go-live:rollback` are not wrapped in `guarded`/`sessionGuarded`, and `userId` comes from the renderer. | Any signed-in renderer, whatever its role, can wipe operational data (all companies, see F5) or overwrite the DB from any listed backup. |
| F5 | P1 | CODE-TRACED | operationalResetService.js:14-66, 235-258 | Operational reset is not company-scoped. It deletes or soft-deletes `RESET_TABLES` across all companies. It also hard-`DELETE`s tables that have no `is_deleted` column, with foreign keys turned off. | In a multi-company install, a go-live reset for one company erases every company's operations. Combined with F2 and F3, the data is not recoverable from inside the app. |
| F6 | P1 | REPRODUCED | importValidationService.js:307,319,328,338,343 (`findOne` not company-scoped) | Transactional imports (procurements, expense entries, invoices, payments) resolve `order_number` and `bank_account` across all companies, but stamp `company_id` with the selected company. | A payment imported under company 2 attached to company 1's order (`pay_company 2, order_company 1`). This breaks company isolation (rule 9) and receivables. |
| F7 | P1 | REPRODUCED | importValidationService.js:465-497 | `rollbackImportBatch` only checks references for `items`. Rolling back a `supply_orders`, `suppliers`, `banks` or similar batch soft-deletes rows that live procurements, invoices or vouchers still use. The blocked list (init.js:218) omits invoices, payments and procurements, which may already be posted. | In the repro, the order was soft-deleted while its procurement stayed live. This orphans operational and accounting data. |
| F8 | P1 | REPRODUCED | masterDataToolsService.js:487-499 | The Master Data Tools import does raw `INSERT`/`UPDATE` and bypasses `createRecord`/`updateRecord`. | A company created through it gets no chart of accounts (0 accounts vs 29 for normal companies), so it cannot post. Updates have no per-row old-value audit. Its `MDT-*` import batch has no records, and rolling it back returns `rolledBackRecords:0` while the batch is marked rolled back. `allowPartial` from the renderer bypasses the lock (L465). |
| F9 | P1 | REPRODUCED | importValidationService.js:525-557 | `deleteUnusedImportedItems` (IPC `items:delete-unused-imported`) hard-deletes every unreferenced item, not only imported ones. | A manually created item master was deleted. The name and confirm text promise "imported items". |
| F10 | P1 | REPRODUCED | importParserService.js:121-131 | The XLSX cell regex `<c([^>]*)>([\s\S]*?)<\/c>` mishandles self-closing cells (`<c r="B2" s="3"/>`, which Excel writes for styled blanks). It swallows the next cell, so values shift into the wrong column. | In the repro, `supplier_contact` "9876543210" landed in `gstin`. On transactional templates an amount can shift into another amount column, e.g. `gst_amount` into `purchase_value`. |
| F11 | P2 | REPRODUCED | importValidationService.js:21-33 (`normalizeImportDate` → `new Date(text).toISOString()`) | Non-ISO dates are parsed as local midnight and then converted to UTC. In IST every such date moves back one day. | In IST, "01-Apr-2025" became 2025-03-31 and "2025/04/01" became 2025-03-31. "1/4/25" was read US-style as 2025-01-03. An XLSX serial "45383" became "+045382-12". This feeds `suppliers.date_of_activation`. |
| F12 | P2 | REPRODUCED | importValidationService.js:151-156 | `dateValue` accepts impossible dates because `new Date("2025-02-31T00:00:00")` rolls over. XLSX date serials are rejected instead of converted. | Orders, invoices and payments can carry the date 2025-02-31, which breaks FY lookup and reports. |
| F13 | P2 | REPRODUCED | importValidationService.js:362-380 | There is no duplicate detection inside a file. Duplicates are only checked against the DB. | Two suppliers with the same GSTIN in one file were both imported. Duplicate order or UTR numbers in one file make the whole transaction throw with no row-level error. |
| F14 | P2 | REPRODUCED | importValidationService.js:388-433 | In `update_existing` mode the updated rows are not recorded in `import_batch_records`. With only updates, `importBatchId` is null. | Import updates cannot be rolled back. Only the `updateRecord` per-row audit remains. |
| F15 | P2 | REPRODUCED | masterDataToolsService.js:229-238 (`csvCell`) | The master-data CSV export does not neutralise formulas and adds no UTF-8 BOM. | A supplier named `=HYPERLINK(...)` (imported via CSV or Tally) is exported live. Hindi and ₹ text is garbled in Excel. The export includes PAN, bank account and Aadhaar-last-4 for employees and suppliers. |
| F16 | P2 | REPRODUCED | GoLiveWizard.jsx:100-140, goLiveService.js:56-96 | "Step 3 Create Backup" calls `executeGoLive`, which already runs the destructive reset. The dependency-blocked check happens at step 5, after the data is gone. `executeGoLiveReset` does not enforce preconditions on the server. | The safety gate runs only after the reset. (Codex item 3: CONFIRMED.) |
| F17 | P2 | REPRODUCED | goLiveService.js:13,21-23; main.js:1068-1070; EnvironmentManagerScreen.jsx:4,487 | The precondition requires `env === "production"` (lowercase), but the UI stores "Production". It reads `config.profile`, but the app writes `verificationProfile`. | The go-live wizard can never pass step 1. Preconditions came back `environment false (Current: Production)`, `profile false (Current: undefined)`. (Codex item 4: CONFIRMED.) |
| F18 | P2 | REPRODUCED | goLiveVerificationService.js:55-58 | The go-live check `zeroVouchers` counts vouchers including soft-deleted ones, but reset only soft-deletes them. The verification also shells out to `node scripts/verify-*.js` against the live data root, and a packaged app has no `node`. | After reset, `vouchers=7` with 0 active, so the check fails. Go-live verification always fails and then triggers the broken rollback (F3). |
| F19 | P2 | REPRODUCED | main.js:988-1019 | `environment:info` reads `counts.vouchers` and `counts.invoices`, which `dashboardCounts` does not return, and `totalOrders` is date-windowed. | A DB with 1 live invoice and 7 vouchers but no orders in the window is labelled "Production Ready". (Codex item 5: CONFIRMED.) |
| F20 | P2 | CODE-TRACED | rollbackService.js:38-42; operationalResetService.js:331-333 | Rollback picks its backup loosely. Go-live falls back to `backups[0]` (the newest of any kind) when its own backup is missing. Reset rollback uses substring `includes` matching in both directions. | It can restore an unrelated, older or newer backup without warning. |
| F21 | P2 | CODE-TRACED | backup.js:93-100, 102-129; main.js:910-926, 1158 | No pre-restore snapshot of the current DB is taken. The pending restore has no cancel API and is applied on the next boot, however much later. If `applyPendingRestore` throws at boot (EBUSY), the exception escapes `whenReady` and the pending files stay, so every boot fails. | Data-loss and boot-loop risk. This widens the known "unsafe restore" defect. |
| F22 | P2 | CODE-TRACED | init.js:665-673, 271-278 | Each migration runs in its own transaction, which is good. But there is no pre-migration backup. `seed`, `ensureAccountMappingRegistry` and `addPhase5AccountingControls` run outside transactions on every boot. Migrations 003 and 021 backfill NULL `company_id` to the first company (schemaDefinitions.js:23-28). | Upgrading has no recovery point, which is exactly when F1 strikes. There is also a silent first-company fallback (rule 9). |
| F23 | P3 | REPRODUCED | tallyImportService.js:72-83 | The Tally regex parser is quadratic on unclosed tags: 100 KB took 0.2 s, 200 KB 0.8 s, 400 KB 3.2 s, all synchronous in the main process. Numeric character references such as `&#39;` are never decoded, and `&amp;lt;` is double-decoded to `<`. | A malformed or partial export freezes the app. Names are imported with literal `&#39;`. (DTD entities are not expanded, which is good.) |
| F24 | P3 | REPRODUCED | supportBundleService.js:20-25 | The bundle selects `module_name` from `audit_log`, which has no such column. `safeAll` swallows the error. | `recentAuditLog` is always `[]` (with 54 audit rows present). The bundle also embeds the renderer `context` verbatim plus 6 KB tails of the renderer and main logs. |
| F25 | P3 | CODE-TRACED | documentService.js:36-41; backup.js | Documents have no size limit: the whole file is read into memory. `file_path` is stored as an absolute path. Backups contain only the DB, not `documents/`. | Large files can crash the app. Documents are lost or broken after restoring on a new machine or data root. |
| F26 | P3 | CODE-TRACED | importParserService.js:110; tallyImportService.js:254-307 | XLSX `inflateRawSync` has no output limit (zip bomb). Tally godown, item and ledger duplicate previews use `firstCompanyId(db)` instead of the selected company. Backups have no retention policy. | Robustness issues, plus a misleading duplicate preview in multi-company installs. |

The import-related `guarded(...)` IPC calls resolve the user from `user_id` in the renderer payload. When it is absent, `userForPermission` falls back to the first active admin (authService.js:64-66). For example, AddRecordPanel and MasterImportTemplatesScreen send no `user_id`, so import and delete permission checks always pass as admin. This is noted for the security reviewer and is not counted above.

## 3. Details and repro output

**F1** (`old-db-upgrade.mjs`): build an aec83eb DB, post a 12345.67 journal, then open it with acf6d02 `initializeDatabase`.
```
ledger rows after upgrade: [... {"debit":12345.67,"credit":0,"debit_minor":0,"credit_minor":0}, ...] (all 14 rows minor=0)
trial balance rows: Cash debit 0 credit 0 balance 0; Capital 0/0/0
stock_ledger after upgrade: {"n":3,"v":121500,"vm":0}
BS rows: all amount 0
moneyIntegrity: migrated_disagrees 48 trust_legacy_with_warning   <- detected only by unused helper
```
The `accounts.opening_balance_minor` column is also 0, so `minorVal("a","opening_balance")` drops account openings too.

Fix direction: run `backfillAll` inside migration 034. Alternatively, a new migration could backfill rows where the minor value is 0 and the legacy value is not 0. Then wire `checkMoneyIntegrity` into health.

**F2 and F3** (`backup-wal.mjs`):
```
live supply_orders: 6  wal bytes: 82432
createBackup() copy supply_orders: 1 (missing 5 recent rows)
executeReset backup contains WAL-* rows: 0
rollbackReset (db handle still open, as in reset:rollback IPC): {"success":true,...}
open handle sees active orders: 0
reopen integrity: ok  active orders: 1  WAL-* rows: 5  WAL-* active: 0  AFTER-RB: 1
```
The rollback reported success, but the reset stayed in effect. Note that `createLiveBackup` (backup.js:58-81, checkpoint plus `db.backup`) is correct; only the reset and go-live path uses the unsafe `createBackup`.

**F6, F7, F8, F9, F12, F13, F14, F15** (`imports.mjs`):
```
F-intra-dup suppliers result {"ok":2,"dup":0}; rows with that GSTIN {"n":2}
F-cross-company payment import {"ok":1}; payment row {"pay_company":2,"order_company":1}
F-date 2025-02-31 dry-run {"ok":1,"errors":[]}
F-rollback order batch with live procurement -> state {"order_deleted":1,"proc_deleted":0}
F-update_existing {"updated":1,"importBatchId":null}
F-MDT company accounts {"accounts":0,"accountsForC1":29}
F-MDT batch rollback {"rolledBackRecords":0}, company still active
F-csv formula export line "S-FX","=HYPERLINK(""http://x"",""click"")",...   BOM? false
F-deleteUnusedImportedItems {"deleted":2}, manualItemStillExists:false
```

**F10 and F11** (`dates-xlsx.mjs`, run with `TZ=Asia/Kolkata`):
```
"01-Apr-2025" -> 2025-03-31 | "15 Aug 2025" -> 2025-08-14 | "2025/04/01" -> 2025-03-31 | "45383" -> +045382-12 | "1/4/25" -> 2025-01-03
XLSX parse with empty self-closing B2: [{"supplier_name":"Alpha Traders","gstin":"9876543210","supplier_contact":""}]
CSV BOM header: ["supplier_name","gstin"]   (BOM handled OK)
```

**F18 and F24** (`golive.mjs`):
```
after reset: goLive zeroVouchers query = 7 => check passed? false ; active vouchers = 0
support bundle recentAuditLog length: 0 ; audit_log rows: 54
```

**F17 and F19** (`codex-4-5.mjs`):
```
item4 preconditions: [["environment",false,"Current: Production"],["profile",false,"Current: undefined"],["readiness",true,"97%"]]
item5 dashboardCounts keys has vouchers/invoices: false false
item5 with orders soft-deleted: live invoices= 1 vouchers= 7 => productionReadiness label: Production Ready
```

**F16** (code): in `GoLiveWizard.jsx`, `step3CreateBackup` (L100-120) calls `apiClient.previewGoLive()` and then `apiClient.executeGoLive("system")`. `executeGoLiveReset` (goLiveService.js:56-96) creates the backup and then immediately calls `executeEnhancedReset`. `step5CheckDependencies` (L131-140) only then inspects `previewData.dependencies.blocked`.

**F23** (`tally-dos.mjs`):
```
unclosed STOCKITEM x5000 (100021 bytes): 197 ms / x10000: 781 ms / x20000 (400 KB): 3218 ms
names: ["Ram's &#39;Pipe&#39; <b> &a;"]
```

## Codex claims, checked independently

1. CONFIRMED (F2). rollbackService.js:5-6 calls backup.js:34-42 `copyFileSync`, with no checkpoint. Repro above.
2. CONFIRMED (F3). main.js:1123-1125 calls `rollbackReset`; no `db.close()` or reopen. Repro above. The same applies to `go-live:rollback` (main.js:1089).
3. CONFIRMED (F16). GoLiveWizard.jsx:105 executes the reset, and the blocked check is at L134-137.
4. CONFIRMED (F17). goLiveService.js:13 and :23 against main.js:313-329 and EnvironmentManagerScreen.jsx:4,487. Repro output above.
5. CONFIRMED (F19). main.js:991; `dashboardCounts` has no `vouchers` or `invoices` keys. Repro output above.

## 4. What looks solid

- `createLiveBackup` (the backup the UI uses) does `wal_checkpoint(FULL)` and then better-sqlite3's online backup, which gives a consistent snapshot.
- `backupPathFromName` resolves the path and confines it to `backups/` (backup.js:21-32), which blocks `../` traversal.
- Each migration is atomic: `runMigration` wraps the callback and the `schema_migrations` insert in one transaction (init.js:665-673). Re-running `initializeDatabase` is idempotent, and every repro re-initialised fine. Migrations 028-035 apply cleanly to an aec83eb DB, apart from F1's semantics.
- `bulkImportRecords` validates every row first, supports dry-run preview, returns row-wise errors with Duplicate or Failed status, writes inside a single transaction, records batches and batch records, and writes an audit row. Master import does not create stock ledger entries; Tally opening stock is reference-only (tallyImportService.js:337, `opening_stock: ""` at L262-264). This satisfies the rule 12 basics apart from F6, F7, F13 and F14.
- The Tally parser does not expand DTD or external entities (no XXE). It handles UTF-16LE/BE BOMs and UTF-8 BOMs (L113-125). CSV BOM headers are handled because JS `trim` removes U+FEFF.
- `safeDeleteService` uses FK-driven child counts with validated, quoted identifiers, and `deleteItemImportBatch` uses it.
- `documentService` checks magic bytes per extension, uses sanitized random stored names under `documents/<company>/<module>/<year>`, requires a company, soft-deletes, and audits upload, delete and replace.
- `operationalResetService` runs its deletes in one transaction and checks `foreign_key_check` before committing.

## 5. Not covered

- I did not run anything on Windows, so file-locking behaviour (F3, F21) is inferred from SQLite and Win32 semantics.
- No Electron runtime: I did not exercise the IPC handlers themselves (F4 is traced from code) or the `shell.openPath` document flows.
- Bank-statement import (`bankReconciliationService`) is outside this file list, and `feedbackService` export was not reviewed.
- `productionReadinessService.js` and `certificationService.js` I only skimmed for writes and deletes; they generate reports only.
- I did not do a full review of `seed()` side effects on a production DB. Seed does insert demo transactions on an empty DB, as seen in the repros.
- I did not test the `.xls` legacy path with a real binary BIFF file.
