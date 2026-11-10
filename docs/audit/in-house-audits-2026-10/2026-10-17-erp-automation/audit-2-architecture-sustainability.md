# Audit 2: Architecture and Sustainability

Repo: `/home/claude/gii-gem-erp`, branch `claude/erp-full-automation-qbhv8k`, HEAD `cfc916e` (2026-10-17). Working tree was clean when audited. No repo files were changed.
Method: read the code directly and measured it with `wc`, `grep` and `npm run test:integrity`. The audit runs on Linux, so nothing was run on Windows and no packaged build was made.

## Verdict

1. **The design fits the business.** The app runs on one desktop: Electron, a single better-sqlite3 database in WAL mode, synchronous services, with posting wrapped in transactions. That is a sound base for a single-office Tally-like ERP and should stay the system of record.
2. **The main risks are in operations, not structure.** Backups stay on the same disk and only run when someone clicks. There is no CI. Nothing tests the packaged Windows build. A database file from the build machine ships in the installer. Alerts are sent only while the app is open.
3. **Two pieces of half-finished debt need closing.** Money is stored both as REAL (floating point) and as `*_minor` integers in paise: 128 REAL columns against 13 shadow integer columns. GST is worked out in at least six places using floating-point maths. Both should be finished before adding any multi-user feature.
4. **Parse Server is not a breakthrough for this app.** Moving it to Parse would mean rewriting about 18k lines of backend logic and all 73 tables. The app would lose offline use and SQLite's all-or-nothing transactions, and would need hosting and someone to run it. Real-time phone access is a small part of the value and can be had far more cheaply.
5. **Recommendation:** keep SQLite as the system of record. Add a **LAN server mode**: one office PC runs the database, the other PCs connect as thin clients, reusing the existing services. Later, if wanted, add a **one-way, read-only cloud summary** for phone dashboards. Move to PostgreSQL only if several branches or more than about 5 people entering data at once become real needs.

---

## 1. Module boundaries

| Measure | Value | Evidence |
|---|---|---|
| `src/main/database/init.js` | 2,039 lines (AGENTS.md audit log still says 7,160; it was cut down later) | `wc -l` |
| `src/renderer/App.jsx` | 1,683 lines, 34 `useState` | `wc -l`, grep |
| `src/main/main.js` | 1,362 lines, 161 IPC registrations | grep |
| Main process + preload, total | 50 JS files, 17,997 lines | `find … | wc -l` |
| Renderer JS/JSX, total | 255 files, 86,563 lines; CSS 7,626 lines | `find … | wc -l` |
| Largest service | `accountingService.js` 1,286 lines | `wc -l` |

- **init.js is still the wiring hub.** It creates nearly every service (`init.js:27-40` imports and `init.js:1758-1910`, e.g. `createAccountingService`, `createInventoryService`, `createBillingService`, `createOperationsService`). It then re-exports them through 12 `export { … }` blocks (`init.js:1960-2039`). It also still holds core posting helpers that belong in a service: `postLedgerEntry` (`init.js:1134`), `nextSeriesNumber` (`init.js:810`), `businessVoucherPayload` (`init.js:963`, about 160 lines), `createAutomaticGrnFromPurchaseVoucher` (`init.js:870`), the receivable and allocation helpers (`init.js:1324-1548`), and the audit chain (`init.js:1571-1692`). The factory pattern (`createXService(deps)`) is good. It keeps services testable, and the critical-defect tests use it. The weak spot is that each service gets its dependencies as a hand-written list, and some of those are late-bound workarounds for circular dependencies (`autoReserveOrderStock: (...args) => autoReserveOrderStock(...args)`, `init.js:1688-1690`). The real dependency graph is therefore hidden in init.js.
- **App.jsx** is a 1,683-line shell. That is within Rule 2 in spirit, but large.
- **Business logic is duplicated in the renderer.** `src/renderer/api/browserFallbackApi.js` (1,120 lines) re-implements profit, GST and stock calculations for browser-preview mode (e.g. `browserFallbackApi.js:31-46`). That breaks Rule 7, because a second copy of the formulas drifts silently. Recommend limiting it to read-only fixture data, or removing it.

## 2. Data model

- **Tables:** 73 distinct `CREATE TABLE IF NOT EXISTS` across `src/main/database/*.js`. 54 are in `schemaDefinitions.js` (1,792 lines); the core tables are inline in `migrate()` (`init.js:282`, e.g. `invoices` at `init.js:445`).
- **Money:** there are 128 `REAL` column definitions. Only 13 integer `*_minor` shadow columns exist, for voucher_lines, ledger_entries, opening_balances, carry_forward_entries, accounts.opening_balance and stock_ledger (`moneyMigration.js:4-16`). Invoices, payments, GST amounts and procurement values are still REAL only (`init.js:455,469`; `schemaDefinitions.js:435,463,495`). Posting itself is checked in paise: `createBalancedVoucher` rejects any voucher where the paise totals differ (`accountingService.js:178-184`). That is the right control. But the dashboard still sums REAL `billing_value` and `payment_amount` (`dashboardService.js:52-53`). The money helper module `src/main/domain/money.js` has `calculatePercentage` and `allocateMoney`, but nothing outside that file calls them.
- **GST** is computed separately in at least six places, using floating-point maths with different rounding: `crudHelpers.js:154`, `billingService.js:13`, `seedData.js:227,261`, `paymentReadinessService.js:35-87` (in SQL), `billingHelpers.js:8` and `supplyOrderHelpers.js:32` (renderer), plus `browserFallbackApi.js:45-46`. There is no single GST engine, and place-of-supply / state-code logic appears in only 11 lines of the main process. This is the biggest risk to correct numbers left in the data model.
- **Migrations:** there are named, run-once migrations recorded in a `schema_migrations` table (`init.js:284`). Each runs inside a transaction through `runMigration` (`init.js:667-675`), with 34 calls. Columns are added with `addColumnIfMissing` (`init.js:684`), 75 calls. On top of that, every startup re-runs the whole idempotent `CREATE TABLE IF NOT EXISTS` and column-adding sequence. Missing:
  - a numeric schema version (`PRAGMA user_version` is not used);
  - "down" or compatibility notes;
  - a check that refuses to open a database created by a *newer* app build;
  - any migration test running against copies of real old databases.
  The restore check only looks for 7 required table names (`backup.js:9`), so restoring a backup from a newer build would open without warning.
- **Database guards:** `UNIQUE(company_id, voucher_number)` (`schemaDefinitions.js:366`) backs up `nextSeriesNumber`, which never reuses a number. Triggers exist only for the account-mapping registry (`accountMappingRegistry.js:174-330`). No trigger stops anyone from UPDATE-ing or DELETE-ing posted `vouchers`, `voucher_lines` or `ledger_entries`. Today that is enforced only in application code, through `WRITE_POLICY.accountingReadOnly` (`init.js:251-270`).

## 3. Transaction and posting integrity

- `db.transaction(` appears 48 times under `src/main`. `createBalancedVoucher` writes the voucher, its lines, the ledger entries and the audit row in one transaction (`accountingService.js:186-215`). Validation runs before the transaction (financial-year check at `:148`, account checks at `:169-174`). That is safe only because a single process and connection writes synchronously. **Any multi-writer future (LAN mode, Parse, Postgres) must move these checks inside the transaction**, or use `BEGIN IMMEDIATE`.
- `nextSeriesNumber` (`init.js:810-820`) scans every number in the series with `LIKE 'PREFIX-%'` on each call: O(n) in the number of vouchers. That is fine for thousands of vouchers. For larger volumes, or more than one writer, use a `document_series` counter table updated inside the posting transaction.
- `connection.js:39-44` sets `journal_mode=WAL` and `foreign_keys=ON`, but no `busy_timeout`. With one connection that does not matter; it becomes mandatory the moment a second process opens the file.
- Recent commits (`4d1cf49`, `0153efa`) made posting and reversal atomic and number series gap-safe. `posting-regressions.test.mjs` (5 tests) and `critical-defects.test.mjs` (20 tests) cover them.

## 4. IPC surface and security

- **IPC:** 161 `ipcMain.handle` registrations through the `handle()` wrapper (`main.js:734`), plus `app:force-close` (`main.js:611`). 82 of them also go through `guarded(permission, module, …)` (`main.js:280`). The preload exposes 164 methods and 161 distinct `invoke` channels (`src/preload/preload.cjs`, 182 lines). Every channel needs a signed-in session except 8 in `PUBLIC_CHANNELS` (`main.js:723-732`). The rest run under `runAsActor` with the session's user. A session that must still change its password is limited to the password-change channels.
- **Gap: 79 channels check the session only, not a permission.** `viewer` is allowed only `export` and `view_reports`, so the role model is only as strong as the list of guarded channels. Recommend a table-driven test asserting that every write-capable channel has a permission.
- **Sessions:** kept in memory and keyed by `webContents.id` (`desktopSessionService.js`). A session ends after 60 idle minutes (`IDLE_TIMEOUT_MINUTES`). Two timeout values disagree: `authService.js:16` has `sessionTimeoutMinutes: 30`, which is used only as the login-lockout length (`:101,139,227`).
- **Passwords:** hashed with scrypt and compared in constant time (`authService.js:23-33`). Logins lock after 5 failures. The default `admin/admin123` login is forced to change its password on first use (`:45-47,107`).
- **Roles:** `ROLE_PERMISSIONS` (`authService.js:5-12`) defines 6 roles in code. Permissions are per action, not per company, so any signed-in user can act on every company.
- **Renderer isolation:** windows use `sandbox:true`, `contextIsolation:true`, `nodeIntegration:false` (`main.js:542-544,565-567`). File reads are limited to files picked in a file dialog (`main.js:265`). Missing: a Content-Security-Policy in `index.html`, and `setWindowOpenHandler` / `will-navigate` guards (none found in `main.js`). `disable-gpu-sandbox` is set (`main.js:153`).
- **Alert secrets:** encrypted with Electron `safeStorage`, which uses Windows DPAPI (`main.js:242-247`). They are tied to the Windows user, so they will not survive a restore onto another PC. That is acceptable, but should be documented.
- **Data at rest:** the SQLite file and its backups are not encrypted. Anyone who can copy `%APPDATA%\GII GeM ERP\database\gii_gem_erp.db` can read all the books.

## 5. Audit trail

- `auditLog` (`init.js:1571-1601`) chains each row with SHA-256 over its stored fields plus the previous row's hash. `verifyAuditChain` (`init.js:1637-1692`) also detects gaps in row ids. The chain's start id is pinned in `schema_migrations` (`:1625-1635`).
- **Limits:**
  - The hash has no secret key. Anyone with write access to the file can rewrite the audit rows and recompute the whole chain.
  - Deleting the newest rows (truncating the tail) is not detected, because nothing records the expected length or last hash outside the file.
  - If `auditLog` is called outside a transaction, a crash between its INSERT and UPDATE leaves a row with no hash. The check would report that as tampering.
- Fix: periodically write the newest hash and row count somewhere outside the database (the backup manifest, the e-mailed daily digest, or the read-model push in §11). That turns "tamper-evident inside the file" into "tamper-evident against the owner of the file".

## 6. Backup and restore (`src/main/services/backup.js`, 210 lines)

- **Strong points:**
  - Backups are consistent copies made with `VACUUM INTO` or `db.backup()` after a WAL checkpoint (`:96-150`).
  - A restore file is checked first: SQLite header, `integrity_check`, required tables (`:17-44`).
  - The current database is copied to a safety backup before a restore (`:48-65`).
  - Restores are staged and applied before the database opens on the next start (`preparePendingRestore` / `applyPendingRestore`).
  - Backup paths are confined to the backups folder (`:84-96`).
- **Gaps:**
  - Backups run only when the user clicks: the only call is `backup:create` (`main.js:1061`); nothing is scheduled.
  - Backups are written to the same `backups/` folder on the same disk.
  - No retention or rotation.
  - No encryption.
  - No check of schema or app version on restore.
  - No copy off the machine (USB, network share or cloud).
  - The "external backup" step in Rule 26.2 is manual.
  For a single PC holding statutory books, this is the most serious operational risk.

## 7. Testing

- `npm run test:integrity` was run during this audit: **46 tests, 46 passed** (37 in the Node run: critical-defects 20, posting 5, alerts 6 top-level plus subtests; and 9 IPC-security tests run with the Electron stub `scripts/audit/lib/electron-stub.mjs`). Total time about 2.3 s.
- There are 74 top-level scripts in `scripts/`. 18 `package.json` scripts run under `electron …` (the `verify:*` scripts that use the real ABI) and the rest under `node`.
- **The better-sqlite3 build conflict:** better-sqlite3 is compiled for one runtime at a time. `test:integrity` needs the Node build (`npm run rebuild:node`); `verify:accounting` and the app need the Electron build (`npm run rebuild:electron`). Developers on Windows must rebuild between runs, so tests get skipped in practice. Fix: run the Node tests under `ELECTRON_RUN_AS_NODE=1 electron --test …` so only the Electron build is needed, or keep two `node_modules` trees in CI.
- `lint:syntax` is a hand-maintained `node --check` list of 51 files. It covers only 17 of the 50 files in main and preload: `backup.js`, `authService.js`, `billingService.js`, `crudHelpers.js` and others are not checked. There is no ESLint, no type checking, and no unit tests for the renderer.
- **No CI:** there is no `.github/workflows` folder.

## 8. Build and packaging (electron-builder settings in `package.json`)

- Targets are NSIS (installer for the current user, install folder can be changed) and portable. better-sqlite3 is unpacked from asar (correct).
- **Shipping risk:** `extraResources` bundles `database/gii_gem_erp.db` from the build machine. `copyBundledDatabaseIfNeeded` (`main.js:198-212`) copies it in on first run. Whatever is in the developer's database at build time (demo companies, test vouchers, users and password hashes, audit rows) ships to customers. Ship an empty database, or none, and let `initializeDatabase` create it.
- `playwright` and `@vitejs/plugin-react` are listed under `dependencies`, so electron-builder packs them into the app. Playwright alone adds tens of MB. Move both to `devDependencies`.
- The renderer is one 2.37 MB JS bundle (`dist/assets/index-*.js`) with no code splitting. About 1.43 MB of knowledge JSON is bundled into the renderer (`src/renderer/knowledge`, `modules/erpBrain/repository`). The largest are `database-graph.json` (350 KB), `renderer-graph.json` (226 KB) and `feature-function-graph.json` (167 KB).
- No code signing is configured. Windows SmartScreen will warn on install.
- `scripts/packaged-runtime-smoke.js` and `smoke-dashboard-packaged.mjs` exist, but nothing runs them automatically.

## 9. Observability (`src/main/services/errorConsoleService.js`, 186 lines)

- Every failed IPC call is journaled to `logs/erp-errors.jsonl` with channel, user, company and user-facing guidance from 14 ordered rules. The file is capped at 500 entries (`:9-10`). Writes never throw (`:55-82`). Renderer `console-message` and `render-process-gone` events are hooked (`main.js:579,589`). This is a good fit for Rule 13.
- **Gaps:**
  - No stack traces are kept (only the message).
  - No `process.on('uncaughtException' | 'unhandledRejection')` handler in main.
  - The journal is re-read and rewritten on every write once it passes 500 entries. That is acceptable at this cap.
  - No log of how long actions take, which would matter before any LAN mode.

## 10. Alerts (`src/main/services/alerts/*`, 345 lines)

- Includes a hand-written SMTP client with STARTTLS (`smtpClient.js`, 114 lines) and the WhatsApp Cloud API through `graph.facebook.com` (`whatsappClient.js`). The schedule is a 10-minute interval inside the Electron main process (`main.js:1341-1345`). The day is marked as sent *before* sending, so a crash never sends twice (`alertService.js:194-196`).
- **Limits:**
  - Alerts are sent only while the desktop app is running and someone is logged in to Windows.
  - The send-day key uses the UTC date (`now.toISOString().slice(0,10)`) while the send time uses local time (`alertService.js:191-193`). In IST these disagree between 00:00 and 05:30, so any send time before 05:30 can misfire.
  - Settings live in a JSON file, not the database, so they are not in backups.
- A server-side scheduler, whether in LAN mode on an always-on PC or in the cloud summary, would make alerts reliable. This is the most concrete benefit of the "real-time / server" idea.

## 11. Maintainability and governance overhead

- **Docs outweigh code in git.** 218 of 676 tracked files are under `docs/` or `reports/`. `docs/architecture` holds about 135 governance files. AGENTS.md runs to 32 rules with a multi-step pipeline for every phase. The intent (audit first, certify before moving on) is good. The volume, though, is now itself a cost to maintain, and it drifts:
  - The AGENTS.md audit log still describes init.js as 7,160 lines.
  - `database-graph.json` was generated 2026-07-29 with `sourceFiles: ["src/main/database/init.js", …]`. The schema has changed since (`schemaDefinitions.js` last changed 2026-08-11, plus the October commits). Nothing regenerates the graph from the live schema.
- **Recommendations:**
  - Generate the graphs from code in CI rather than hand-certifying them.
  - Load the graphs lazily or keep them in the main process, not in the renderer bundle.
  - Replace per-phase prose reports with a short changelog plus test evidence.
- **Stray files:** two debugging files, `_diag.cjs` and `_diagnose.mjs`, sit in the repo root, and `scripts/` contains one-off `inspect-*` and `debug-*` scripts.

---

## 12. Parse Server evaluation

**What Parse is.** An open-source Node.js backend (Express middleware) that stores data in MongoDB or PostgreSQL. It provides:
- REST and GraphQL APIs;
- LiveQuery (WebSocket subscriptions that push changes);
- Cloud Code (server-side triggers and functions);
- class-level permissions and per-object ACLs;
- file storage, push notifications and a Dashboard.

*Maintenance status, partly verified:* a web search on 2026-10-17 showed 9.5.0 alpha builds of parse-server listed in CPE databases, and several 2026 CVEs indexed for parse-server on releasealert.dev. The project therefore looks actively maintained, but it also has a steady flow of security advisories that whoever hosts it must keep up with. Exact current stable version and support policy: **unverified**.

**What it would give this app:**
- several PCs or phones seeing changes live (LiveQuery);
- a ready-made REST/GraphQL API for a mobile dashboard;
- ACLs per object;
- server-side scheduled jobs, which would make alerts reliable.

**What it would cost here:**

| Cost | Specifics for this codebase |
|---|---|
| Rewrite of the system of record | 73 SQLite tables, about 18k lines of synchronous better-sqlite3 service code, 161 IPC channels and the reports written as SQL (`reportBuilders.js`, 1,014 lines). Reports like trial balance and ageing depend on SQL joins and aggregates. On Parse with MongoDB they become aggregation pipelines; on Postgres you would be going *around* Parse's object model. |
| Double-entry integrity | Today the voucher, its lines, the ledger entries and the audit row commit together in one SQLite transaction (`accountingService.js:186`). Parse's object API saves objects one at a time. Cloud Code `beforeSave` hooks cannot open a transaction across several classes. Parse has a batch `transaction` option (MongoDB replica set or Postgres), but how complete and reliable it is for this kind of use is *unverified*. In practice you would end up writing raw database transactions inside Cloud Code, which removes most of what Parse adds. |
| Offline-first loss | The product is "offline Windows desktop ERP" (`package.json` description). Parse has no built-in offline-write sync for desktop (the client SDKs' local datastore is a cache, not a ledger-safe write queue). An internet outage would stop invoicing and posting. |
| Hosting and operations | Someone would have to run a Node server, MongoDB or Postgres, TLS, backups, upgrades and security patches (see the CVE flow above). For a single office with no IT staff this is a new ongoing cost and a new way for things to fail. |
| Security model | ACLs replace the current server-side `enforcePermission`. Misconfigured class-level permissions are a classic Parse data-leak pattern. All of the current hardening (session binding, guarded channels) would have to be redone. |
| Data residency | Financial and GST records of a GeM supplier. A cloud host should be in India; DPDP Act duties apply to personal data in the records. A self-hosted LAN install avoids this but brings back the operations cost. |
| Audit and statutory | The hash chain, the financial-year lock and the posting controls would all have to be rebuilt and re-certified. Under Rules 26 and 27 this is a full new programme (baseline, stabilise, certify, lock). |
| Effort | **About 6-12 months for one experienced developer** to reach feature parity, plus re-certification. Risk: high, because accounting correctness gets rebuilt from scratch. |

**Lighter alternatives, compared:**

| Option | What it gives | Effort | Risk | Keeps offline use | Fit |
|---|---|---|---|---|---|
| A. Status quo plus hardening | Reliable single PC | 3-5 wk (roadmap items 1-6) | Low | Yes | Required anyway |
| B. **LAN server mode**: one PC holds the SQLite file and serves a small authenticated HTTP/WebSocket API from Electron main, reusing the existing service functions; other PCs run the same app as thin clients through the same preload API names | 2-10 users in the office, live updates over WebSocket, alerts from an always-on PC | 6-10 wk | Medium (needs `busy_timeout`, `BEGIN IMMEDIATE`, checks moved inside transactions, row-version optimistic locking) | Yes for the server PC; clients need the LAN | **Best value** |
| C. One-way **read-model push**: after each commit, or every N minutes, send summary data (dues, stock, day totals, last audit hash) to a small hosted store and a phone web dashboard | Phone dashboards and alerts while away | 3-5 wk on top of A | Low (read-only, no write-back) | Yes | Good second step |
| C'. Parse used *only* as that read-model store (LiveQuery to phones, no accounting in Parse) | Same as C, with ready-made real-time and ACLs | 4-6 wk plus ongoing hosting | Low-medium (operations, patching) | Yes | Acceptable, but heavier than needed. A static JSON endpoint, Supabase or Firebase would also do. Choose only if you already know Parse well. |
| D. PostgreSQL behind a thin Node API as system of record | Real multi-writer database, multiple branches | 4-6 months | High (port every query and the transaction code) | No, unless you also build a sync engine | Only if multiple branches or concurrent writers become real |
| E. Parse as system of record | Real-time, BaaS | 6-12 months | High | No | **Not recommended** |
| Not recommended in any form: SQLite file on a network share | — | — | SQLite's own documentation warns that file locking over network filesystems is unreliable and can corrupt the database | — | **Avoid** |

**Recommendation:** Parse is *not* a breakthrough for this application. The value it promises (several devices, real-time, phones) is reached more cheaply and more safely in this order: A (harden), then B (LAN server mode reusing the existing services and IPC names, so Rule 4 is kept), then C (one-way read-only cloud summary for phones and alerts). Parse can be considered only as the store behind C. Accounting, GST and inventory stay in SQLite on the office server PC. Revisit D (Postgres) only when there are multiple branches or a sustained need for more than about 5 people entering data at once.

**Phased roadmap (rough, one developer):**

| Phase | Scope | Size | Exit criterion |
|---|---|---|---|
| P0 Stabilise | Roadmap items 1-6 below | 3-5 wk | CI green on Windows, automatic off-disk backups, money and GST fully in integers |
| P1 Prepare for more than one writer | `busy_timeout`, `BEGIN IMMEDIATE` posting, validation inside transactions, `row_version` columns, `document_series` counter table, per-company permissions | 2-3 wk | Concurrency stress test (2 processes, 10k postings) balances exactly |
| P2 LAN server mode | Transport adapter in main (HTTPS + token or session), thin-client mode in preload using the same method names, service discovery, server-side scheduler for alerts and backups | 6-10 wk | 3 PCs posting at the same time; trial balance identical; server PC loses power mid-post, nothing is lost |
| P3 Read-model and phone dashboard | Outbound one-way publisher (summary tables only, no personal data beyond party names; host in India), read-only phone web app, last audit hash published with each push | 3-5 wk | Phone figures match desktop reports on the same day; nothing can be written back |
| P4 (only if needed) | Postgres / multi-branch | 4-6 mo | New programme under Rules 26-27 |

---

## 13. Sustainability roadmap: top 10 by risk reduction per unit of effort

| # | Change | Risk it removes | Effort | Ratio |
|---|---|---|---|---|
| 1 | **Automatic backups**: on close and daily, with rotation (e.g. 7 daily, 4 weekly, 12 monthly), copied to a second location (USB or network folder or cloud) with a manifest holding row counts and the last audit hash. Check app and schema version on restore. | Losing the books with the disk; restoring an incompatible backup | 3-4 d | Very high |
| 2 | **Stop shipping the dev database**: remove `extraResources database/gii_gem_erp.db`; move `playwright` and `@vitejs/plugin-react` to devDependencies | Leaking dev data or credentials; a much larger installer | 0.5 d | Very high |
| 3 | **Windows CI** (GitHub Actions `windows-latest`): `npm ci`, build, `test:integrity`, `verify:accounting`, `verify:financials` under Electron (`ELECTRON_RUN_AS_NODE`, so no better-sqlite3 rebuild is needed), plus `pack:win` and `packaged-runtime-smoke.js` | Regressions reaching users; the Node/Electron build conflict; "works on my machine" | 3-5 d | Very high |
| 4 | **Real migration versioning**: `PRAGMA user_version` plus an ordered migration list; refuse to open a newer schema; run migration tests on old database fixtures; move the `CREATE TABLE` in `migrate()` into numbered files | Schema drift; silent restore of incompatible data | 1-1.5 wk | High |
| 5 | **Integer money everywhere**: add `*_minor` to invoices, payments, receivables, procurement, expenses and GST columns; make reports and the dashboard read the minor columns only; retire REAL after a reconciliation pass (`moneyMigration.js` is the starting point) | Paise drift between reports, dashboard and GST returns | 2-3 wk | High |
| 6 | **GST engine module** (`src/main/domain/gst.js`): one function for taxable value to CGST/SGST/IGST by place of supply, with per-line rounding on `calculatePercentage` / `allocateMoney`; replace the 6+ call sites; delete renderer and fallback copies; table-driven tests | Wrong tax on invoices and returns | 1.5-2 wk | High |
| 7 | **Database immutability triggers** for posted `vouchers`, `voucher_lines`, `ledger_entries` and `audit_log` (block UPDATE and DELETE except the allowed reversal and status columns), plus anchoring the audit hash outside the file | Tampering, or a code bug bypassing `WRITE_POLICY` | 3-4 d | High |
| 8 | **IPC permission matrix test** plus CSP / `setWindowOpenHandler`: every write channel must carry a `guarded` permission; add per-company permissions | Privilege gaps across the 79 channels that only check the session | 3-5 d | Medium-high |
| 9 | **Split init.js into a composition root** (`src/main/app/container.js`) plus posting, numbering and receivables modules; remove late-bound circular workarounds; drop or freeze `browserFallbackApi.js` business logic | Hidden coupling; duplicated formulas | 1.5-2 wk | Medium |
| 10 | **Prepare for more than one writer** (P1 above): `busy_timeout`, `BEGIN IMMEDIATE`, checks inside transactions, `row_version`, series counter table | A prerequisite for LAN mode, so no corruption or duplicate numbers | 2-3 wk | Medium (only once LAN mode is needed) |

Also worth doing (small): a code-split renderer bundle and graphs loaded lazily (2.37 MB bundle); ESLint in place of the hand-kept `node --check` list; generating the knowledge graphs from the live schema in CI; fixing the UTC/local date mismatch in alerts (`alertService.js:191`); keeping stack traces in the error journal plus a main-process `uncaughtException` handler; code signing; reducing per-phase governance prose to a changelog plus test evidence.

---
Sources for Parse status (web search 2026-10-17; details unverified):
- https://cpe.gcve.eu/cpes/1614365
- https://releasealert.dev/github/parse-community/parse-server/cves
