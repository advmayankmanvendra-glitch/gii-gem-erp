# PR #4 in-house security audit

Branch `claude/erp-full-automation-qbhv8k` @ `dc73221`, auditor: in-house security pass (Claude), 2026-10-22. Read-only. Probes ran against the real `src/main/main.js` handlers through the repo's Electron stub, each with its own temp data root (`/tmp/claude-0/-home-claude-gii-gem-erp/4f25981b-b764-5350-b053-b95349bc2505/scratchpad/inhouse-sec/probe.mjs`). The existing `scripts/audit/ipc-security.test.mjs` passes 9/9.

## Verdict

The basic Electron setup is correct. The window uses contextIsolation, sandbox and no nodeIntegration. Every non-public channel needs a signed-in session. Passwords are hashed with scrypt, and alert secrets go through safeStorage. SQL takes no caller-chosen identifiers. Backup paths are confined to the backups folder.

The weaknesses are in authorization depth and integrity:
- **Permissions are per action, not per table.** As a result, the lowest write role can change supplier and company bank accounts.
- **Most reads have no role check, and nothing limits a user to a company.**
- **Sessions survive a database restore.**
- **The audit "tamper-evident" chain can be recomputed by anyone who can open the database file.** Any signed-in user can also add audit rows with chosen content.
- **Electron is pinned at the end-of-life 37.0.0.** There is no navigation guard and no CSP.

**F1 should block the merge.** Fix F2 and F3 before any release build. Nothing is remotely exploitable without local access or an injection foothold.

## Findings

### High

**F1. A data-entry operator can rewrite supplier and company bank details.** Location: `src/main/main.js:1046-1048`, `src/main/services/authService.js:10,59-64,70`.
- **Weakness:** `records:create/update/delete` are guarded as `guarded("edit","records",…)`. `enforcePermission` checks only the action, never the table. `data_entry_operator` holds `create` and `edit`. There is no second approval (maker-checker) for bank-field changes.
- **Attack:** An operator edits `suppliers.supplier_account_number` and `supplier_bank_ifsc_code`, or `companies.account_number`. The next supplier payment or invoice then carries the attacker's account.
- **Evidence:** Confirmed by running. The `deo1` account changed the supplier account to `999988887777`, the IFSC to `EVIL0000001` and the company account to `111122223333`.
- **Fix:** Check permissions per table and field. Make `companies`, `banks` and the bank fields on `suppliers`/`employees` admin-only, or route them through an approval queue. Audit-log the old and new bank values explicitly.

### Medium

**F2. Electron 37.0.0 is end-of-life and has never been patched.** Location: `package.json:84` (`^37.0.0`), `package-lock.json` (locks 37.0.0).
- **Weakness:** 37.x left Electron's three-major support window early in 2026 (inferred from Electron's 8-week cadence). 37.0.0 is the first build of that line and lacks every later Chromium and V8 security backport.
- **Attack:** Any content-injection foothold (F3) turns into a known renderer exploit.
- **Evidence:** By reading. EOL status is inferred.
- **Fix:** Move to a currently supported major. Pin an exact version and add `npm audit` or an Electron-version check to CI.

**F3. There is no navigation or new-window guard and no CSP, on a window whose session is bound to the webContents.** Location: `src/main/main.js:555-609`, `index.html:1-16`, `src/main/main.js:272-277`.
- **Weakness:** There is no `will-navigate`, `setWindowOpenHandler` or `Content-Security-Policy`. The session is looked up by `event.sender.id`, which stays the same across navigation, and the preload still exposes about 160 channels.
- **Attack:** Injected markup (for example `dangerouslySetInnerHTML` in `src/renderer/components/overlays/index.jsx:152`) or a link navigates the main window to a remote page. That page inherits the signed-in session and the full `window.giiGemErp` API, including restore and reset if an admin is signed in.
- **Evidence:** By reading. No XSS vector was found today; React escapes, and the print snapshot is serialized DOM.
- **Fix:** Deny all `will-navigate` to non-`file:`/dev-server origins. Return `{action:"deny"}` from `setWindowOpenHandler`. Add a strict CSP meta tag (`default-src 'self'; object-src 'none'`). Apply the same to the print window.

**F4. Sessions survive restore, reset and rollback.** Location: `src/main/main.js:1063-1082`, `:336-344`, `:1282-1305`, `src/main/services/desktopSessionService.js:46-56`.
- **Weakness:** The in-memory session map is never cleared when the database file is swapped. Session-only channels (`main.js:748-753`) do not re-read the user.
- **Attack:** An admin restores an older backup. A user who does not exist in that backup, or who was disabled in it, keeps reading all data. A user id that maps to a different person in the restored file acts under that person's id on guarded calls.
- **Evidence:** Confirmed by running. After restore, `viewer1` was absent from `users`, yet `accounting:data` and `records:list` still succeeded.
- **Fix:** Call `clearAllSessions()` after every `initializeDatabase` that follows a file swap. Have `sessionUser` re-validate the user's `status` against the database.

**F5. The audit hash chain is unkeyed, so anyone with file access can rewrite it.** Location: `src/main/database/init.js:1615-1646,1650-1663,1682-1711`.
- **Weakness:** The chain is plain SHA-256 over row fields. The algorithm is in the source, and there is no secret or external anchor. `sqlite_sequence` and `schema_migrations` are editable too.
- **Attack:** Someone with the `.db` file edits a past row (or deletes rows and lowers `seq`) and recomputes the hashes. `verifyAuditChain` then reports clean. Restoring an older backup also silently discards newer audit history.
- **Evidence:** Confirmed by running. A `login_success` row was changed to `login_failed`: before re-hashing, `broken:[64]`; after re-hashing, `broken:[]` and 70 rows verified.
- **Fix:** Use an HMAC with a key held in safeStorage. Periodically export the chain head (hash and id) outside the database, for example in alert mail or a write-once log, and check against it. Document the remaining limits.

**F6. Any signed-in user can write audit rows with chosen table, record and old/new values.** Location: `src/main/main.js:1005-1014`.
- **Weakness:** The handler spreads the caller's payload (`table_name`, `record_id`, `module`, `company_id`, `old_value`, `new_value`) into `auditLog`. Only the `action` text is filtered, by a deny-list regex.
- **Attack:** A viewer adds a row on `vouchers`/1 reading `{"amount":999999,"note":"edited by accountant"}`. A reviewer filtering a record's history sees fabricated entries. The real user id is recorded, but the row is chained, so it looks genuine.
- **Evidence:** Confirmed by running.
- **Fix:** Accept only `{screen, view}`. Force `table_name="ui"` and drop `old_value`, `new_value` and `record_id`. Use an allow-list of actions.

**F7. A zip bomb in XLSX import exhausts main-process memory, reachable by any role.** Location: `src/main/services/importParserService.js:92-115,163-170`, `src/main/main.js:904`.
- **Weakness:** `inflateRawSync` has no `maxOutputLength`. Every entry is inflated, including entries that are never used. There is no size cap on `imports:parse-buffer` and no permission guard.
- **Attack:** A supplier-sent `.xlsx`, or a viewer, freezes or crashes the ERP while it holds the database open.
- **Evidence:** Confirmed by running. A 398 KB file used 787 MB of RSS and blocked for 4.2 s. Adding entries scales this to OOM.
- **Fix:** Inflate only the needed parts with `maxOutputLength` (for example 50 MB in total). Reject inputs over about 20 MB. Guard the channel with `import`.

**F8. Reads are not permission-checked, and nothing scopes users to companies.** Location: `src/main/main.js:813-816,847,853,860,862,896,1045,1050,1307-1318` and others.
- **Weakness:** 63 session-only channels return data with no role check. Every handler takes `company_id` from the payload, and `users` has no company link (`src/main/database/init.js:294-302`).
- **Attack:** A `viewer` (meant to have `view_reports`) or a data-entry operator reads profitability, ledgers, bank statements, supplier bank details and documents for every company. Changing `company_id` switches company with no check.
- **Evidence:** Confirmed by running. The viewer read `accounting:data` and `profitability:list`.
- **Fix:** Guard reads with `view_reports` or a per-module permission. If several legal entities share one install, add user-to-company grants and resolve `company_id` against them on the server.

### Low

**F9. Any user can flush the error journal.** Location: `src/main/main.js:1103-1106`, `src/main/services/errorConsoleService.js:10,58-77`. The renderer can append unlimited entries to a file capped at 500 rows, so noise pushes out real failure evidence. Confirmed by running: 505 viewer calls removed a real entry. Fix: rate-limit, or journal screen errors separately from backend errors.

**F10. Feedback author is spoofable.** Location: `src/main/main.js:1320`, `src/main/services/feedbackService.js:25-33`. `user_id` and `user_name` come from the payload. Confirmed by running: a viewer stored feedback as user 1, "System Administrator". Fix: take the author from the session.

**F11. CSV exports allow formula injection.** Location: `src/main/services/masterDataToolsService.js:210-213`, `src/renderer/utils/spreadsheetExport.js:126-129`, `src/renderer/utils/fileParsers.js:365-368`.
- **Weakness:** Cells starting with `= + - @` (or tab/CR) are written as-is. Master data often arrives from outside sheets, such as supplier names.
- **Attack:** A cell like `=HYPERLINK(...)` or a DDE payload runs when the export is opened in Excel. XLSX export is safe because it uses `inlineStr`.
- **Evidence:** By reading.
- **Fix:** Prefix risky leading characters with `'`.

**F12. Any user can launch an unverified installer.** Location: `src/main/main.js:1147-1153,416-436`. Any signed-in role can `shell.openPath` any `.exe` named in `latest.json` in the user-writable update folder, with no signature or hash check. By reading. Fix: require `settings`, verify an Authenticode signature or a signed SHA-256, and audit-log the launch.

**F13. Lockout can lock others out.** Location: `src/main/services/authService.js:89-101`. Five wrong passwords at the login screen lock any named account, `admin` included, for 30 minutes. By reading. Fix: backoff delay instead of a hard lock, or a super-admin unlock.

## IPC coverage

| Class | Count |
|---|---|
| Channels registered | 162 (161 through `handle()`, plus raw `app:force-close`) |
| `guarded(...)` (session, DB role check, actor overwrite) | 82 |
| `sessionGuarded(...)` | 8 |
| Session only, no permission check | 63 (5 of them call `sessionUser` explicitly) |
| Public (before login) | 8, plus `app:force-close` |

- **Destructive channels** (reset, restore, rollback, go-live, delete, import, environment, settings, alert settings, error-console clear) are all `guarded` with `system_reset`, `restore_backup`, `delete`, `import` or `settings`. The actor comes from the session; `withActor` overwrites the payload actor fields (`main.js:251-263,280-299`).
- **Session-only channels that write or are side-effecting:** `audit:context` (F6), `health:error-console-record` (F9), `feedback:submit` (F10), `updates:install` (F12), `imports:parse-buffer` (F7), `health:verification-snapshot` and `health:support-bundle` (write files to runtime), `feedback:export`, `print:pdf` (save dialog), `health:open-folder`, `backup:open-folder`.
- **Session-only channels that read company data** (F8): `dashboard:counts`, `references:list`, `profitability:list`, `accounting:data/drilldown`, `bank:data`, `voucher-proposals:data`, `billing:data`, `inventory:data`, `records:list/search`, `documents:list/view/download`, `imports:batches/rollback-preview/item-batches`, `master-data:completeness/health`, the 8 `crac:*` reads, `environment:info`, `health:*` reads, `reset:preview/analyze-dependencies`, `go-live:preview/preconditions/history`, `deployment:readiness`, `feedback:list`.
- **Note for the correctness audit:** `deployment:readiness` (`main.js:1229`) and `go-live:preconditions` (`:1241`) declare `(payload)` but receive the IPC event, so the caller's `company_id` is always ignored.

## Checked and clean

- **BrowserWindow:** `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true` (`main.js:563-568`); the print window is sandboxed (`:536-546`). No `webSecurity:false`, no remote URL in production, and no `shell.openExternal`. The custom menu has no devtools entry. The preload exposes fixed wrappers only, with no generic `invoke(channel)`.
- **Auth:** scrypt with a 16-byte salt and `timingSafeEqual`. The default `admin/admin123` is forced to change, and every non-public channel is blocked until it is changed (`main.js:750`). There is a 60-minute idle timeout. Admin reset clears the target's sessions. Recovery reset has its own lockout.
- **SQL:** all table names are allow-listed (`crudHelpers.js:33`, `assertWriteAllowed`), and field lists come from fixed definitions. `entitySearch` clamps limit and offset, and the dynamic identifiers in reset and safe-delete come from schema metadata. No caller-controlled identifier reaches SQL.
- **Files:** import and document reads need a dialog-picked path (`selectedFiles`). Backup and restore names are confined to `backups/` and validated (header, `integrity_check`, required tables); rollback accepts only listed backups. Uploads are type- and magic-checked and stored under generated names.
- **Secrets:** SMTP and WhatsApp secrets are stored only as safeStorage ciphertext. `publicSettings` strips them, and errors mask credentials. SMTP uses `tls.connect` with default certificate verification. Plain AUTH is refused when STARTTLS is missing (except localhost). WhatsApp uses a fixed `https://graph.facebook.com` URL. The error journal stores only the channel, the message (truncated to 2000 characters) and the ids, with no payloads.
- **Dependencies:** no `xlsx`/SheetJS (custom parser); no known advisory for better-sqlite3 12.10.0.
