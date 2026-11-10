# Security audit: 9dac174..605a873 (in-house)

Date: 2026-11-10. Branch `claude/erp-full-automation-qbhv8k`, head `605a873`. Scope: `git diff 9dac174..605a873` (the docs/audit archive copies are excluded). The audit was read-only on the checkout. Probes ran in a scratch clone at `/tmp/claude-0/sec605/repo` (the scripts are in `/tmp/claude-0/sec605/probes/`). `node --test scripts/audit/audit2-regressions.test.mjs` passes (45/45) on the scratch clone.

## Verdict on the claimed fixes

| Earlier finding | Status | Evidence |
|---|---|---|
| xlsx expansion check bypassed by trailing padding | **Fixed** for trailing padding. In-stream padding still gets past it (see F4, low) | Probe: a 60 MiB part with 1 MiB of trailing zeros reports `bytesWritten` 61,156, so the 1,029x part is refused. 75 K empty stored blocks *inside* the deflate stream are counted as consumed: the ratio drops to 167x and the part passes |
| Inline budget could never be reached | **Fixed** | Probe: 21 K rows x 10 cells of `&amp;`x20 is refused with "more than 16 million stored characters…" (~1.6 s) |
| Tally preview cap counted only LEDGER/STOCKITEM | **Fixed for `tally:preview-master-migration`. Partly fixed for `tally:preview-stock-xml`** (see F2) | Migration preview: 120 K GROUP, 120 K COMPANY and 60 K GROUP + 60 K LEDGER are each refused in 130-410 ms. Stock-XML preview: only STOCKITEM is capped. 1.5 M UNIT blocks parse, freeze the main thread for 8.3 s and return a 68 MB reply |
| Grant rows written on read-only channels | **Fixed** | The four `account-mapping:*` read channels and `auth:list-users` pass `{ readOnly: true }`. The four account-mapping read functions have no INSERT/UPDATE/auditLog. The ipc-security test covers this |
| Grant company taken from a different argument than the handler gets | **Fixed in `sessionGuarded` only.** `guarded()` still has the bug (F3) | main.js:357 now uses `args.slice(0, 1)`. main.js:328 is unchanged |
| Support bundle trusted the screen's user and had unbounded context | **User: fixed. Size: partly fixed** (F1) | `signedInHealthContext` overrides user_id/user_name/role/dbName after the spread. Values are capped at 200 chars, but **key names are not capped** |
| Unused `sessionRequired` | **Fixed** (removed) | |

## Findings

### F1 (Medium): any signed-in user can write support bundles of hundreds of MB through long context *keys*

- **Where:** `src/main/main.js:196-211` (`signedInHealthContext`) and `main.js:1178` (`health:support-bundle`). The bundle is written by `src/main/services/supportBundleService.js:27-45`.
- **Problem:** The filter keeps at most 50 entries and cuts string values to 200 chars, but it copies each **key** at whatever length the screen sent. The context goes into the bundle twice: `payload.context` and `diagnostics.context` (via `safeJson`). The bundle is pretty-printed JSON written to `exports/support-bundles/` under a new timestamped name on every call, with no count or size limit. The channel has no role check (only a session), so a `viewer` can call it.
- **Exploit path:** Code running in the renderer calls `window.api.exportSupportBundle(ctx)`, where `ctx` has 50 keys of 1 MiB each (a 50 MB IPC request). This needs XSS or any renderer foothold. DevTools is not on the app menu, so a normal user has to get code into the renderer first. Probe (`bundle.mjs`): a **100 MB file per call, ~0.8 s on the main thread**. With 4 MiB keys a call writes ~400 MB. A loop fills the disk that holds the database and backups.
- **Fix:** Cap the keys too. Either allow-list the keys the health services read (`company_id`, `company_name`, `company_scope`, `companyId`, …) or drop any key longer than ~64 chars. Also consider `guarded("export" | "backup", …)` for `health:support-bundle`, and keep only the newest N bundles.

### F2 (Low): `tally:preview-stock-xml` caps STOCKITEM only; UNIT/GODOWN/STOCKGROUP are unbounded

- **Where:** `src/main/services/tallyImportService.js:425-441`, which calls `parseTallyStockItemsXml` (lines 343-353, `uniqueNamedTallyBlocks` with no limit).
- **Problem:** The fix promised "one budget for all master kinds", but the stock-XML channel counts only STOCKITEM against `MAX_TALLY_PREVIEW_MASTERS`. The migration preview applies `take()` to every kind.
- **Exploit path:** A `data_entry_operator` (who has the `import` permission) is sent a crafted "Tally export" and opens it with Browse → Preview. Probe (`tally2.mjs`): a 40 MB file of 1.5 M `<UNIT>` blocks takes **8.3 s on the Electron main thread** (every window freezes) and returns a **68 MB** reply. 1.2 M GODOWN: 6.9 s and 45 MB.
- **Fix:** In `previewTallyStockXml`, count UNIT + GODOWN + STOCKGROUP + STOCKITEM against one budget, the same way `take()` does. The simplest route is to pass a limit into `parseTallyStockItemsXml` and make `uniqueNamedTallyBlocks` honour it.

### F3 (Low): `guarded()` still names the grant row's company from a different argument than the handler uses

- **Where:** `src/main/main.js:328` (`firstPayload(args)` over all args) and line 336 (`recordGrant`).
- **Problem:** The fix changed `sessionGuarded` only. For `guarded` channels whose first argument is not a plain object, a plain object passed as an extra argument sets the `company_id` on the `permission_granted` row. Examples: `backup:restore(fileName)`, `financial-years:status(id, status)` and `health:error-console-clear()`.
- **Exploit path:** An admin (or code in an admin's renderer) calls `ipcRenderer.invoke("backup:restore", "x.db", { company_id: 7 })`, and the grant row for the restore names company 7. Only users who already hold the permission can do this, so the impact is limited to an inaccurate audit trail. It is not a privilege gain, because permissions are role-based and do not depend on the company.
- **Fix:** Make `guarded` work like `sessionGuarded`: take `firstPayload(args.slice(0, 1))` for the grant row's company. Better, have `recordGrant` take `company_id` only from the argument the handler actually treats as the payload.

### F4 (Low / defence-in-depth): the xlsx expansion ratio can still be dodged with padding inside the stream

- **Where:** `src/main/services/importParserService.js:333-349`.
- **Problem:** `engine.bytesWritten` correctly ignores bytes after the end of the stream. Empty non-final stored blocks (`00 00 00 FF FF`, 5 bytes each) are valid deflate, though, and the inflater counts them as consumed.
- **Probe (`z.mjs`, `xlsx.mjs`):** A 60 MiB sheet part grows from 257 KB to 564 KB with in-stream padding. Unpadded it is refused ("expands 240 times"). Padded it is parsed in 1.7 s.
- **Impact:** Small. The absolute caps still apply (64 MiB per part, 128 MiB total, 2 M cells, 64 M chars, 16 M entity chars), and a legitimately compressed 6 MB file reaches the same work. The ratio check is a heuristic, not a bound.
- **Fix (optional):** Treat the absolute caps as the real control. Document that the ratio check is advisory, or replace it with a cap on wall-clock or parsed bytes. Don't spend more effort on making the ratio exact.

### F5 (Info): the Tally migration preview is bounded but still blocks the main thread and amplifies the reply

- **Probe (`tally.mjs`, `tally3.mjs`):**
  - 100 K ledgers in a 49 MB file: 9.6 s, 68 MB reply.
  - 100 K stock items in a 49 MB file: 7.9 s, 75 MB reply.
  - One LEDGER (or STOCKITEM) with a 45 MB NAME: a **135 MB** reply, because the name is copied into `tally_ledger_name`, `import_payload.*` and other fields.
  - A 45 MB-byte Devanagari name: a 90 MB reply.
- **Assessment:** These are within the budgets this change sets, so they are not a regression. Unlike `importParserService` (`MAX_REPLY_BYTES`), there is no cap on name/field length or on reply bytes.
- **Fix:** Clip master names and addresses to a sane length (for example 512 chars, a Tally name is far shorter). Optionally run the preview in a worker or utility process.

### F6 (Info): `ensurePurchasePriceVarianceAccount` cannot be abused for privilege gain

- **Where:** `src/main/database/init.js:804-826`, called from `src/main/services/inventoryService.js:417` (`inventory:post-return`, `guarded("post")`: admin and accountant only) and from `seedAccounts` (on startup and when a company is created).
- **Checked:**
  - **Who can trigger the write?** Only roles with `post`. The account row is created without an audit row, which is a minor gap in the trail.
  - **Can the target ledger be planted?** Rows in `accounts` are read-only through `records:*`. They can only be created through `accounts:create-quick` (`account_mapping`: admin and accountant). Its duplicate check is case-insensitive, and the seeder creates the ledger for every company at startup, so a same-name ledger of the wrong type (for example a Liability) cannot be planted first. An exact-name ledger that already exists is reused whatever its type. Only roles that can already post journals could arrange that, so there is no escalation.
  - **Can the code search be abused?** The search loop (`5065…`) ends at the first free code and needs a large number of quick-created ledgers to slow down.
  - **Can the split values be abused?** Quantity must be positive and no more than stock (inventoryService.js:392-394). The split cannot produce NaN or a negative amount on a line: negative portions are filtered out, and the Inventory credit is always `retValue`. A voucher is created only when `retValue` > 0.
- **Suggestion (hardening):** Match the name case-insensitively, and refuse to reuse a ledger whose `account_type` is not Expense. Write an `auditLog` row when the ledger is created outside the seeder.

### Other changes reviewed, no security issue

- `orderClosureService.js` (credit-note netting).
- `billingService.expenseFormulaAmount` and `browserFallbackApi.js`.
- `useEntitySearch.js`: a pending debounce blocks loadMore.
- `ProfitSimulatorScreen.jsx`: clears results on a company switch. The clamps only affect the display, and the main process clamps too.
- The `package.json` lint list.

## Probe scripts

- `/tmp/claude-0/sec605/probes/z.mjs`: inflate `bytesWritten`, with trailing padding and with in-stream padding.
- `/tmp/claude-0/sec605/probes/xlsx.mjs` and `/tmp/claude-0/sec605/probes/xlsx2.mjs`: the real parser, with a padded part and with the inline entity budget.
- `/tmp/claude-0/sec605/probes/tally.mjs`, `/tmp/claude-0/sec605/probes/tally2.mjs` and `/tmp/claude-0/sec605/probes/tally3.mjs`: the budget, reply size and timing of the migration and stock-XML previews.
- `/tmp/claude-0/sec605/probes/ctx.mjs` and `/tmp/claude-0/sec605/probes/bundle.mjs`: key-length handling in `signedInHealthContext`, and the size of the support bundle file.
