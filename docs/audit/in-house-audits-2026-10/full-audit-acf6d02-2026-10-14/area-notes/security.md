# Security audit: auth, authorization, Electron boundary (acf6d02)

## 1. Scope covered

Files read in full: `src/main/main.js` (1176 lines), `src/preload/preload.cjs`, `src/main/services/authService.js`, `src/main/services/desktopSessionService.js`, `src/renderer/api/client.js`, `src/main/services/documentService.js`, and the relevant parts of `src/main/services/operationalResetService.js`, `src/main/services/backup.js`, `src/main/services/operationsService.js` (approveTransaction), `src/main/database/init.js` (auditLog, auth exports), `src/main/database/seedData.js` (default admin), `src/renderer/api/browserFallbackApi.js`, `src/renderer/features/auth/LoginScreen.jsx` / `src/renderer/screens/LoginScreen.jsx`, `src/renderer/App.jsx` (print snapshot, logout), `src/renderer/print/printUtils.js`, `index.html`.
Diff reviewed: `git -C /tmp/claude-0/cur diff aec83eb acf6d02 -- src/main/main.js src/preload src/main/services/authService.js src/main/services/desktopSessionService.js`.

How it was tested: I did **not** only trace main.js. I wrote a small harness, `/tmp/claude-0/aud-work/security/{electron-stub.mjs,hooks.mjs,register.mjs,harness.mjs}`. It swaps the `electron` module for a stub through a Node module-resolve hook, then imports the **real** `src/main/main.js`. The real `registerIpc()` runs against a throwaway DB in `os.tmpdir()`, and every one of the 155 handlers can be called with a fake `event.sender.id`. That gives true IPC-level repros (including the Electron session layer) without Electron.
Scripts: `t1-channels.mjs` … `t8-golive.mjs`. Run them with `node --import ./register.mjs tN.mjs` from `/tmp/claude-0/aud-work/security`. Each one deletes its temp root.

## 2. Findings table

| id | sev | status | file:line | defect | impact |
|---|---|---|---|---|---|
| SEC-1 | P0 | REPRODUCED | main.js:222-227, 178-182; authService.js:64-67,70 | `guarded()` never looks at the desktop session. It checks the `user_id` that the renderer supplies, and when there is none it **falls back to the first active admin**. The renderer never sends a user_id for posting/reverse/delete/restore/approve. | Every one of the 67 `guarded` channels runs with admin rights whoever is logged in, including a `viewer` and a window that never logged in. Backend RBAC is ineffective. |
| SEC-2 | P0 | REPRODUCED | main.js:1101-1125, 1056-1099, 1033-1045 | Go-live, reset and environment channels are fully **open** (no guard at all): `reset:execute`, `reset:execute-enhanced`, `reset:rollback`, `go-live:execute/complete/rollback`, `deployment:certify`, `environment:switch-type/set-profile`. | Before login, `reset:execute`, `reset:execute-enhanced` and `go-live:execute` all soft-delete or delete all operational data: vouchers 7→0, ledger_entries 16→0, invoices 1→0, stock_ledger 3→0. `reset:execute` **writes no audit row**. `reset:rollback` overwrites the live DB file and unlinks -wal/-shm while main's shared connection stays open. The next write makes the DB unreadable (SQLITE_IOERR_SHORT_READ). See section 3a. |
| SEC-3 | P1 | REPRODUCED | main.js:646-648; authService.js:121-151 | `auth:change-password` is open before login. It never checks or increments `failed_login_count`, it ignores `locked_until`, and on success it **clears the lockout**. | Unlimited online password guessing with no lockout. A locked account can be unlocked at once by anyone who knows the password. Confirms the user report "password-change bypasses lockout". |
| SEC-4 | P1 | REPRODUCED | main.js:5-99 (imports), 651, 655, 659 | `setRecoverySecret`, `recoveryResetPassword` and `adminResetPassword` are used in main.js but **never imported**, so ReferenceError. | All three new password-recovery and admin-reset flows are dead in the shipped app (Forgot password, Settings > Security). A locked-out or forgotten-password admin has no supported recovery path. `lint:syntax` (`node --check`) cannot catch this, and no test covers it. |
| SEC-5 | P1 | REPRODUCED / CODE-TRACED | main.js:861; 842,856; 717-759; operationsService.js:209-220; operationalResetService.js:226-258 | Actor identity in the audit trail comes from three different sources: the session (sessionGuarded), whatever the renderer sends (guarded, and positional `userId` args), or a hard-coded null/"system". `audit:context` writes any renderer payload straight into `audit_log`. | Audit rows cannot be trusted. A forged `{user_id:1, action:"voucher_approved"}` row was inserted before login. Approvals from Posting Control record `approved_by = NULL` (the renderer passes `null`). Doc view/download log `user_id NULL`. Confirms "actor identity is mixed". |
| SEC-6 | P2 | REPRODUCED | main.js:636-641; authService.js:104-118 | Forced password change is enforced only by the UI. `auth:login` binds a fully privileged desktop session even when `forcePasswordChange: true`. | With admin/admin123 the session-guarded channels (`auth:list-users`, `account-mapping:*`) work before the password is ever changed. Combined with SEC-1, the backend never enforces first-run hardening. |
| SEC-7 | P2 | REPRODUCED | main.js:680-683,714,720,727,729,763,797-800,835,892,897,909,929-952,1127-1142 | All read channels (accounting data, ledgers, receivables, billing, documents list, records:list, health/support bundle, feedback export) are open before login and take any `company_id`. | No authentication is needed to read the full books. Exploitable only through renderer compromise or devtools, but it means "login" protects nothing at the IPC layer. |
| SEC-8 | P2 | CODE-TRACED | main.js:765 | `imports:parse-file(filePath)` is open and parses any path the renderer names (xlsx/xls/csv parser), returning the rows. | Arbitrary local file read (spreadsheet/CSV-parsable content) from the renderer, with no dialog and no permission check. |
| SEC-9 | P2 | CODE-TRACED | authService.js:246-260 | `adminResetPassword` lets an `admin` reset a `super_admin` password (it checks only that the actor is admin or super_admin). | Privilege escalation admin to super_admin once the handler works (currently masked by SEC-4). |
| SEC-10 | P3 | CODE-TRACED | desktopSessionService.js:20-31; authService.js:16; main.js:617 | No session expiry (`sessionTimeoutMinutes` is used only as the lockout duration). View > Reload resets the renderer to the login screen but leaves the main-process session bound. Changing or resetting a password does not drop that user's other sessions. | An unattended desktop stays authorised indefinitely. |
| SEC-11 | P3 | CODE-TRACED | main.js:471-525; index.html | No CSP, no `will-navigate` handler, no `setWindowOpenHandler`. `disable-gpu-sandbox` is switched on (main.js:146). | Defence in depth only. No external links or unsafe HTML sinks were found in the renderer (see section 4). |
| SEC-12 | P3 | CODE-TRACED | authService.js:207-221 | `recoveryResetPassword` gives different errors for an unknown/no-secret user and for a wrong secret. | Username/secret-configured enumeration (moot while SEC-4 stands). |
| SEC-13 | P3 | CODE-TRACED | src/renderer/utils/uiHelpers.js:1-3 | `isAdminUser` does not recognise `super_admin`. | A super_admin gets a non-admin UI (no All Companies view, no admin security panel). |
| SEC-14 | P3 | CODE-TRACED | src/renderer/screens/LoginScreen.jsx (hint), seedData.js:361-373 | The login page always shows "admin / admin123" as the first-login hint, even after the password has changed. Default admin is seeded with that password. | Information disclosure. Mitigated by the forced-change flag (UI only, see SEC-6). |

Counts: P0 2, P1 3, P2 4, P3 5.

## 3. Details and repro output

### SEC-1: `guarded()` is not tied to the logged-in user, and defaults to admin
Trace:
- `guarded()` main.js:222-227 calls `enforcePermission(db, permission, userContext(args, …))`.
- `userContext` main.js:178-182 takes `user_id/userId/created_by/uploaded_by/imported_by` from the **first plain-object argument** the renderer passed.
- `enforcePermission` authService.js:70 calls `userForPermission(db, null)`. authService.js:66 is `SELECT … WHERE status='active' ORDER BY CASE WHEN role IN ('super_admin','admin') THEN 0 ELSE 1 END, id LIMIT 1`, which is the admin.
- `event.sender.id` and `desktopSessions` are never consulted.

The renderer calls `api.reverseVoucher(id, reason)`, `api.postTransaction(module, id)`, `api.deleteRecord(table, id)`, `api.approveTransaction(module, id, null, …)` and `api.closeFinancialYear({company_id,…})` with no user id (AccountingScreen.jsx:72,96,101,406,460; BillingVoucherScreen.jsx:301,310; TransactionScreen.jsx:362; MasterScreen.jsx:111). So the check is always made against admin.

For channels whose arguments are all scalars (`bank:status`, `bank:post-approved`, `voucher-proposals:generate/approve/reject/create-draft/post-draft`, `inventory:post-*`, `inventory:approve-adjustment`, `inventory:post-transfer`, `allocations:*-unallocate`, `advances:adjustment-reverse`, `vouchers:guided-status/guided-post`, `vouchers:reverse`, `posting:post`, `approval:approve`, `financial-years:status`, `records:delete`, `backup:create`, `backup:restore`, `crac:delete`, `crac:closure-mark`, `imports:item-batch-delete`, `items:delete-unused-imported`), `firstPayload()` finds no object. Those channels check against admin **even if** the renderer passes a viewer's userId positionally.

The fallback pre-dates this branch (it was in init.js:260-263 at aec83eb). The new desktop session service was applied to only 9 of 155 channels.

Repro (t2-guard.mjs / t5-viewer.mjs, real main.js handlers):
```
records:create companies pre-login -> {"ok":{"id":2,"company_name":"PreLogin Co",...}}
backup:create pre-login -> {"ok":{"fileName":"gii_gem_erp_2026-10-14T10-45-16-721Z.db",...}}
audit rows for PreLogin create: [{"action":"create","user_id":null,"user_role":null,"table_name":"companies"}]
viewer login -> {"id":2,"username":"viewer1","role":"viewer",...}
viewer records:create companies (renderer sends no user_id) -> ok id=2
viewer records:delete companies -> {"err":"Error: Cannot delete: companies #2 is referenced by 29 row(s)..."}   <- passed permission, reached business validation
viewer backup:restore (bogus name, shows permission passed) -> {"err":"Error: Backup file not found"}
viewer account-mapping:assign (sessionGuarded) -> {"err":"Error: Permission denied: account_mapping"}   <- the session path works
viewer records:create with spoofed user_id=1 -> {"ok":{"id":3,"company_name":"Spoof",...}}
viewer financial-years:create -> {"err":"... name, start date and end date are required"}  <- passed "settings" permission
viewer same call with own user_id=2 -> {"err":"Error: Permission denied: settings"}
```
Wider blast radius of a known defect: "unsafe restore (no validation)" is reachable by any role through `backup:restore` (admin fallback), and by an unauthenticated window through `reset:rollback` (SEC-2).

### SEC-2: Open destructive channels (no guard at all)
main.js:1105-1110 `reset:execute` → `executeReset` (operationalResetService.js:226-258). The function never calls `auditLog`. main.js:1116 `reset:execute-enhanced`, 1123 `reset:rollback` (`restoreBackup` while `db` is still open, unlike `backup:restore` at 910-927, which closes it first), 1077 `go-live:execute`, 1085/1089 complete/rollback (actor hard-coded "system"), 1060 `deployment:certify`, 1033/1040 environment config writes.
Repro (t4-open.mjs, window id 42 never logged in):
```
environment:switch-type -> {"ok":{"success":true,"environment":"Production"}}
before reset: supply_orders live = [{"n":1}] vouchers live = [{"n":7}]
reset:execute pre-login -> ok, backup=gii_gem_erp_2026-10-14T10-47-02-300Z.db
after reset: supply_orders live = [{"n":0}] vouchers live = [{"n":0}]
audit rows for reset: []
deployment:certify pre-login -> {"ok":{"certificate":{"certificateNumber":"GLC-2026-000001",...}}}
```
(Side observation, not in my area: on the reset DB, `go-live:execute` then threw `SqliteError: FOREIGN KEY constraint failed`.)


### 3a. Codex claim verification (requested by coordinator)

Claim: "Any renderer can invoke reset:execute with an arbitrary userId; the enhanced-reset and go-live handlers are similarly unguarded; they delete/soft-delete vouchers, ledger entries, invoices, inventory" (main.js ~1106).
**Verdict: CONFIRMED (REPRODUCED).**
- Handlers have no `guarded`/`sessionGuarded` wrapper, and `userId` is taken straight from the renderer payload. Evidence: main.js:1105-1110 `reset:execute` (`(_event, { userId }) => executeReset(db, runtimeDataRoot, userId)`), main.js:1116-1121 `reset:execute-enhanced`, main.js:1077-1079 `go-live:execute` (calls `executeEnhancedReset`, goLiveService.js:73). preload.cjs:152,154,158 expose them.
- Scope of the wipe is `RESET_TABLES`, operationalResetService.js:14-54: ledger_entries, cash_bank_ledger, voucher_lines, vouchers, guided_vouchers, invoices, payments, receivables, stock_ledger, stock_*, inventory_movements, bank tables, import_batches, crac_records and others. Tables with `is_deleted` are soft-deleted; the rest get a hard `DELETE` (lines 233-243 / 267-277). Foreign keys are disabled during the run (`runWithForeignKeysDisabled`).
- The userId is arbitrary. `executeReset` ignores it and writes no audit (226-258). `executeEnhancedReset` writes it verbatim as the audit `user_id` (288-292, `user_role` null). With a userId that does not exist (31337), the data is **wiped and committed first**. Only then does the audit insert fail with `SqliteError: FOREIGN KEY constraint failed`. The caller sees an error but the data is already gone, and there is no audit row.
Repro (t6-reset.mjs, t8-golive.mjs, t4-open.mjs; windows that never logged in):
```
reset:execute pre-login -> ok ; supply_orders 1->0, vouchers 7->0 ; audit rows for reset: []
reset:execute-enhanced pre-login {userId:1} -> ok auditId=54 ; audit: {"user_id":1,"user_role":null,"action":"operational_reset"}
reset:execute-enhanced pre-login {userId:31337} -> SqliteError: FOREIGN KEY constraint failed ; after: vouchers 0, invoices 0 ; audit: none
go-live:execute pre-login {userId:1}: before {"v":7,"inv":1,"le":16,"sl":3} -> after {"v":0,"inv":0,"le":0,"sl":0}
```
(v = live vouchers, inv = live invoices, le = live ledger_entries, sl = live stock_ledger; all filtered on is_deleted=0.)

Rollback handler, main.js:1123-1125: **CONFIRMED (REPRODUCED). It overwrites the DB while the shared connection stays open.**
- `reset:rollback` is open (no guard). It calls `rollbackReset(runtimeDataRoot, backup)` (operationalResetService.js:316-339). That calls `restoreBackup` (backup.js:90-98), which unlinks `-wal`/`-shm` and `copyFileSync`s the backup over the live `.db`. Main's module-level `db` handle is neither closed nor reopened. Compare `backup:restore`, main.js:910-927, which does `db.close()` and then `initializeDatabase`.
- If `backup` is empty, the latest backup is chosen. If it is a non-matching string, it is passed through, and `backupPathFromName` (backup.js:21-31) then confines it to `backups/`. So there is no path traversal.
Repro (t7-rollback.mjs, clean backup from `backup:create`):
```
live files before: gii_gem_erp.db,gii_gem_erp.db-shm,gii_gem_erp.db-wal
backup file opened standalone: journal: wal integrity: ok vouchers: 7
reset:rollback -> {"ok":{"success":true,...}} | live files after: gii_gem_erp.db size 638976 vs backup 638976
live DB, fresh connection after rollback: journal: wal integrity: ok vouchers: 7
write via main's still-open handle -> ok id=2
main handle reads companies: ["AfterRollback","Gesture India Infrastructure"]
live DB, fresh connection after write: -> SQLITE_IOERR_SHORT_READ disk I/O error
```
Impact: after one unauthenticated rollback call, the process keeps reading and writing through a stale handle (writes appear to succeed). The on-disk database can then no longer be opened by a new connection, so it is effectively corrupt on the next app start. Severity P0, data loss. This widens the known "unsafe restore" defect: this path also skips the close/reopen that `backup:restore` does.

### SEC-3: Password change bypasses lockout (user report confirmed)
`auth:change-password` (main.js:646-648) has no guard and no session. `changeUserPassword` (authService.js:121-151) looks the user up by `user_id` **or** `username`. On a wrong current password it only writes an audit row (line 131): no counter, no lock. It never reads `locked_until`. On success it sets `failed_login_count = 0, locked_until = NULL` (lines 146-147).
Repro (t3-lockout.mjs):
```
A) after 25 wrong change-password attempts: {"failed_login_count":0,"locked_until":null,...}
A) change-password pre-login with correct guess -> {"ok":{"id":1,"username":"admin",...,"forcePasswordChange":false}}
B) after 5 bad logins: {"failed_login_count":5,"locked_until":"2026-10-14T11:16:47.515Z",...}
B) correct login while locked -> {"ok":null}
B) change-password while locked -> {"ok":{"id":1,"username":"admin",...}}
B) state after: {"failed_login_count":0,"locked_until":null,"force_password_change":0}
B) login immediately -> {"ok":{"id":1,...}}
```

### SEC-4: Recovery and admin-reset handlers reference unimported functions
The main.js import list (lines 5-99) has `changeUserPassword` and `authenticate`, but not `setRecoverySecret`, `recoveryResetPassword` or `adminResetPassword`. init.js does export them (line 1900-1901). Callers: `src/renderer/screens/LoginScreen.jsx:65` (Forgot password), `src/renderer/components/settings/index.jsx:153,179,207`.
Repro (t1-channels.mjs):
```
auth:recovery-reset -> { err: 'ReferenceError: recoveryResetPassword is not defined' }
auth:set-recovery-secret (session) -> { err: 'ReferenceError: setRecoverySecret is not defined' }
auth:admin-reset-password (session) -> { err: 'ReferenceError: adminResetPassword is not defined' }
```
The service functions work when called directly. The defect is purely the missing import, plus the fact that `lint:syntax` is `node --check`, which does not resolve identifiers.

### SEC-5: Actor identity is mixed (user report confirmed)
These are the sources of "who acted" in this commit:
1. **Session** (correct): the 8 `sessionGuarded` channels pass `{user_id: session user}` as `actor` (main.js:229-247).
2. **Renderer-supplied**: the 67 `guarded` channels check a renderer `user_id` or admin (SEC-1), while the business function records a *different* value: the positional `userId` arg (e.g. `approveTransaction(db, module, id, userId)` main.js:759, stored as `approved_by`/`checker_id`/audit `user_id` in operationsService.js:209-220). The UI passes `null` (AccountingScreen.jsx:101), so approvals have no checker and maker-checker separation cannot be evaluated. `reset:execute-enhanced` audits the renderer `userId` (operationalResetService.js:288-292).
3. **Hard-coded**: `documents:view` and `documents:download` audit `user_id: null` (main.js:842, 856). Go-live verify/complete/rollback use `"system"` (1082-1090). `reset:execute` writes no audit row.
4. **Session-required but ignores the session**: `auth:set-recovery-secret` (main.js:649-653) requires a session, but its handler drops the `actor` argument. `setRecoverySecret` targets `payload.user_id || payload.username` (authService.js:172-179), so the account changed is the one the renderer names, not the signed-in user. A current password is still required, which limits impact.
5. **Forgeable**: `audit:context` (main.js:861) is open and inserts the renderer payload verbatim through `auditLog` (init.js:1530-1560). `event_hash` is a per-row SHA-256 with no chaining, so it gives no tamper evidence.
Repro (t4-open.mjs):
```
forged row: [{"id":54,"user_id":1,"user_role":"admin","action":"voucher_approved","table_name":"vouchers","record_id":999}]
```

### SEC-6: Forced password change not enforced in main
main.js:638 binds the session whenever `authenticate` returns a user, including when `forcePasswordChange` is true (authService.js:104-117). LoginScreen.jsx withholds `onLogin` until the user changes the password. That is the only enforcement.
Repro (t3-lockout.mjs part C):
```
C) login with force flag -> {"ok":{...,"forcePasswordChange":true}}
C) sessionGuarded auth:list-users before changing -> {"ok":[{"id":1,"username":"admin",...
C) sessionGuarded account-mapping:registry before changing -> {"ok":{"reportingProfile":{"code":"GII_STANDARD",...
```

### SEC-7 / SEC-8
t4-open.mjs: `accounting:data pre-login keys -> references,accounts,vouchers,guidedVouchers,voucherLines,ledger,cashBank,receivables`. `documents:list` with `{}` passes `company_id = 0`, which documentService.js:72-83 treats as "all companies". `imports:parse-file` is traced only: main.js:765 passes the renderer path straight to `parseImportFile`.

## IPC channel guard table (all 155 handlers in main.js)
Legend: **OPEN** means no check at all, callable before login. **guarded** means a permission check against the renderer `user_id`, or the first admin when none is sent (SEC-1). It is NOT session-bound. **sessionGuarded** means the permission is checked against the user bound to `event.sender.id` at login. **sessionRequired** means a session is needed, with no permission check. "preload" says whether preload.cjs exposes the channel.
Totals: 79 OPEN, 67 guarded, 8 sessionGuarded, 1 sessionRequired.

| channel | line | guard | permission | preload |
|---|---|---|---|---|
| app:force-close | main.js:527 | OPEN |  | yes |
| auth:login | main.js:636 | OPEN |  | yes |
| auth:logout | main.js:642 | OPEN |  | yes |
| auth:change-password | main.js:646 | OPEN |  | yes |
| auth:set-recovery-secret | main.js:649 | sessionRequired |  | yes |
| auth:recovery-reset | main.js:654 | OPEN |  | yes |
| auth:admin-reset-password | main.js:657 | sessionGuarded | settings | yes |
| auth:list-users | main.js:662 | sessionGuarded | settings | yes |
| meta:masters | main.js:677 | OPEN |  | yes |
| meta:transactions | main.js:678 | OPEN |  | yes |
| master-data:definitions | main.js:679 | OPEN |  | yes |
| dashboard:counts | main.js:680 | OPEN |  | yes |
| references:list | main.js:681 | OPEN |  | yes |
| profitability:list | main.js:682 | OPEN |  | yes |
| accounting:data | main.js:683 | OPEN |  | yes |
| account-mapping:registry | main.js:684 | sessionGuarded | account_mapping | yes |
| account-mapping:classifications | main.js:690 | sessionGuarded | account_mapping | yes |
| account-mapping:coverage | main.js:696 | sessionGuarded | account_mapping | yes |
| account-mapping:review-queue | main.js:702 | sessionGuarded | account_mapping | yes |
| account-mapping:assign | main.js:708 | sessionGuarded | account_mapping | yes |
| bank:data | main.js:714 | OPEN |  | yes |
| bank:preview-import | main.js:715 | OPEN |  | yes |
| bank:create-import | main.js:716 | guarded (renderer user_id / admin fallback) | import | yes |
| bank:status | main.js:717 | guarded (renderer user_id / admin fallback) | approve | yes |
| bank:manual-match | main.js:718 | guarded (renderer user_id / admin fallback) | edit | yes |
| bank:post-approved | main.js:719 | guarded (renderer user_id / admin fallback) | post | yes |
| voucher-proposals:data | main.js:720 | OPEN |  | yes |
| voucher-proposals:generate | main.js:721 | guarded (renderer user_id / admin fallback) | approve | yes |
| voucher-proposals:update | main.js:722 | guarded (renderer user_id / admin fallback) | edit | yes |
| voucher-proposals:approve | main.js:723 | guarded (renderer user_id / admin fallback) | approve | yes |
| voucher-proposals:reject | main.js:724 | guarded (renderer user_id / admin fallback) | approve | yes |
| voucher-proposals:create-draft | main.js:725 | guarded (renderer user_id / admin fallback) | create | yes |
| voucher-proposals:post-draft | main.js:726 | guarded (renderer user_id / admin fallback) | post | yes |
| billing:data | main.js:727 | OPEN |  | yes |
| billing:save | main.js:728 | guarded (renderer user_id / admin fallback) | create | yes |
| inventory:data | main.js:729 | OPEN |  | yes |
| inventory:post-inward | main.js:730 | guarded (renderer user_id / admin fallback) | post | yes |
| inventory:post-outward | main.js:731 | guarded (renderer user_id / admin fallback) | post | yes |
| inventory:post-adjustment | main.js:732 | guarded (renderer user_id / admin fallback) | post | yes |
| inventory:post-return | main.js:733 | guarded (renderer user_id / admin fallback) | post | yes |
| inventory:approve-adjustment | main.js:734 | guarded (renderer user_id / admin fallback) | approve | yes |
| inventory:auto-reserve-order | main.js:735 | guarded (renderer user_id / admin fallback) | edit | yes |
| inventory:create-delivery-challan | main.js:736 | guarded (renderer user_id / admin fallback) | create | yes |
| inventory:confirm-delivery-challan | main.js:737 | guarded (renderer user_id / admin fallback) | post | yes |
| inventory:create-transfer | main.js:738 | guarded (renderer user_id / admin fallback) | create | yes |
| inventory:post-transfer | main.js:739 | guarded (renderer user_id / admin fallback) | post | yes |
| allocations:receipt-create | main.js:740 | guarded (renderer user_id / admin fallback) | edit | yes |
| allocations:receipt-unallocate | main.js:741 | guarded (renderer user_id / admin fallback) | reverse | yes |
| allocations:receipt-reallocate | main.js:742 | guarded (renderer user_id / admin fallback) | edit | yes |
| allocations:supplier-create | main.js:743 | guarded (renderer user_id / admin fallback) | edit | yes |
| allocations:supplier-unallocate | main.js:744 | guarded (renderer user_id / admin fallback) | reverse | yes |
| allocations:supplier-reallocate | main.js:745 | guarded (renderer user_id / admin fallback) | edit | yes |
| advances:receipt-create | main.js:746 | guarded (renderer user_id / admin fallback) | create | yes |
| advances:supplier-create | main.js:747 | guarded (renderer user_id / admin fallback) | create | yes |
| advances:receipt-adjust | main.js:748 | guarded (renderer user_id / admin fallback) | edit | yes |
| advances:supplier-adjust | main.js:749 | guarded (renderer user_id / admin fallback) | edit | yes |
| advances:adjustment-reverse | main.js:750 | guarded (renderer user_id / admin fallback) | reverse | yes |
| credit-terms:save | main.js:751 | guarded (renderer user_id / admin fallback) | settings | yes |
| party-opening:create | main.js:752 | guarded (renderer user_id / admin fallback) | opening_balance | yes |
| vouchers:create | main.js:753 | guarded (renderer user_id / admin fallback) | post | yes |
| vouchers:create-business | main.js:754 | guarded (renderer user_id / admin fallback) | create | yes |
| vouchers:guided-status | main.js:755 | guarded (renderer user_id / admin fallback) | approve | yes |
| vouchers:guided-post | main.js:756 | guarded (renderer user_id / admin fallback) | post | yes |
| vouchers:reverse | main.js:757 | guarded (renderer user_id / admin fallback) | reverse | yes |
| posting:post | main.js:758 | guarded (renderer user_id / admin fallback) | post | yes |
| approval:approve | main.js:759 | guarded (renderer user_id / admin fallback) | approve | yes |
| financial-years:create | main.js:760 | guarded (renderer user_id / admin fallback) | settings | yes |
| financial-years:status | main.js:761 | guarded (renderer user_id / admin fallback) | financial_year_close | yes |
| opening-balances:create | main.js:762 | guarded (renderer user_id / admin fallback) | opening_balance | yes |
| accounting:drilldown | main.js:763 | OPEN |  | yes |
| financial-years:close | main.js:764 | guarded (renderer user_id / admin fallback) | financial_year_close | yes |
| imports:parse-file | main.js:765 | OPEN |  | yes |
| imports:parse-buffer | main.js:766 | OPEN |  | yes |
| imports:select-file | main.js:767 | OPEN |  | yes |
| tally:select-xml-file | main.js:776 | OPEN |  | yes |
| tally:select-migration-file | main.js:785 | OPEN |  | yes |
| tally:preview-stock-xml | main.js:794 | guarded (renderer user_id / admin fallback) | import | yes |
| tally:preview-master-migration | main.js:795 | guarded (renderer user_id / admin fallback) | import | yes |
| imports:confirm | main.js:796 | guarded (renderer user_id / admin fallback) | import | yes |
| imports:batches | main.js:797 | OPEN |  | yes |
| imports:rollback-preview | main.js:798 | OPEN |  | no |
| imports:rollback | main.js:799 | guarded (renderer user_id / admin fallback) | delete | yes |
| imports:item-batches | main.js:800 | OPEN |  | yes |
| imports:item-batch-delete | main.js:801 | guarded (renderer user_id / admin fallback) | delete | yes |
| items:delete-unused-imported | main.js:802 | guarded (renderer user_id / admin fallback) | delete | yes |
| master-data:export | main.js:803 | guarded (renderer user_id / admin fallback) | export | yes |
| master-data:preview-update | main.js:807 | guarded (renderer user_id / admin fallback) | import | yes |
| master-data:confirm-update | main.js:810 | guarded (renderer user_id / admin fallback) | import | yes |
| master-data:completeness | main.js:814 | OPEN |  | yes |
| master-data:health | main.js:817 | OPEN |  | yes |
| documents:select-file | main.js:820 | OPEN |  | yes |
| documents:upload | main.js:834 | guarded (renderer user_id / admin fallback) | create | yes |
| documents:list | main.js:835 | OPEN |  | yes |
| documents:view | main.js:836 | OPEN |  | yes |
| documents:download | main.js:845 | OPEN |  | yes |
| documents:delete | main.js:859 | guarded (renderer user_id / admin fallback) | delete | yes |
| documents:replace | main.js:860 | guarded (renderer user_id / admin fallback) | create | yes |
| audit:context | main.js:861 | OPEN |  | yes |
| print:html | main.js:863 | OPEN |  | yes |
| print:pdf | main.js:874 | OPEN |  | yes |
| records:list | main.js:892 | OPEN |  | yes |
| records:create | main.js:893 | guarded (renderer user_id / admin fallback) | create | yes |
| records:update | main.js:894 | guarded (renderer user_id / admin fallback) | edit | yes |
| records:delete | main.js:895 | guarded (renderer user_id / admin fallback) | delete | yes |
| purchase-orders:convert-to-work-order | main.js:896 | guarded (renderer user_id / admin fallback) | create | yes |
| records:search | main.js:897 | OPEN |  | yes |
| accounts:create-quick | main.js:901 | sessionGuarded | account_mapping | yes |
| backup:create | main.js:908 | guarded (renderer user_id / admin fallback) | backup | yes |
| backup:list | main.js:909 | OPEN |  | yes |
| backup:restore | main.js:910 | guarded (renderer user_id / admin fallback) | restore_backup | yes |
| health:diagnostics | main.js:929 | OPEN |  | yes |
| health:checks | main.js:936 | OPEN |  | yes |
| health:support-bundle | main.js:939 | OPEN |  | yes |
| health:verification-console | main.js:945 | OPEN |  | yes |
| health:verification-snapshot | main.js:948 | OPEN |  | yes |
| health:open-folder | main.js:953 | OPEN |  | yes |
| updates:status | main.js:969 | OPEN |  | yes |
| updates:open-folder | main.js:970 | OPEN |  | yes |
| updates:install | main.js:976 | OPEN |  | yes |
| environment:info | main.js:984 | OPEN |  | yes |
| environment:get-profiles | main.js:1025 | OPEN |  | yes |
| environment:set-profile | main.js:1033 | OPEN |  | yes |
| environment:switch-type | main.js:1040 | OPEN |  | yes |
| backup:open-folder | main.js:1047 | OPEN |  | yes |
| deployment:readiness | main.js:1056 | OPEN |  | yes |
| deployment:certify | main.js:1060 | OPEN |  | yes |
| deployment:certificate-history | main.js:1064 | OPEN |  | yes |
| go-live:preconditions | main.js:1068 | OPEN |  | yes |
| go-live:preview | main.js:1073 | OPEN |  | yes |
| go-live:execute | main.js:1077 | OPEN |  | yes |
| go-live:verify | main.js:1081 | OPEN |  | yes |
| go-live:complete | main.js:1085 | OPEN |  | yes |
| go-live:rollback | main.js:1089 | OPEN |  | yes |
| go-live:history | main.js:1093 | OPEN |  | yes |
| certificate:generate | main.js:1097 | OPEN |  | yes |
| reset:preview | main.js:1101 | OPEN |  | yes |
| reset:execute | main.js:1105 | OPEN |  | yes |
| reset:analyze-dependencies | main.js:1112 | OPEN |  | yes |
| reset:execute-enhanced | main.js:1116 | OPEN |  | yes |
| reset:rollback | main.js:1123 | OPEN |  | yes |
| crac:list | main.js:1127 | OPEN |  | yes |
| crac:get | main.js:1128 | OPEN |  | yes |
| crac:create | main.js:1129 | guarded (renderer user_id / admin fallback) | create | yes |
| crac:update | main.js:1130 | guarded (renderer user_id / admin fallback) | edit | yes |
| crac:delete | main.js:1131 | guarded (renderer user_id / admin fallback) | delete | yes |
| crac:stats | main.js:1132 | OPEN |  | yes |
| crac:payment-readiness | main.js:1133 | OPEN |  | yes |
| crac:billed-without-crac | main.js:1134 | OPEN |  | yes |
| crac:payment-delayed | main.js:1135 | OPEN |  | yes |
| crac:closure-compute | main.js:1136 | OPEN |  | yes |
| crac:closure-mark | main.js:1137 | guarded (renderer user_id / admin fallback) | edit | yes |
| crac:closure-pending | main.js:1138 | OPEN |  | yes |
| feedback:submit | main.js:1140 | OPEN |  | yes |
| feedback:list | main.js:1141 | OPEN |  | yes |
| feedback:export | main.js:1142 | OPEN |  | yes |

## 4. What looks solid (with evidence)
- **BrowserWindow hardening**: the main window has `contextIsolation: true, nodeIntegration: false, sandbox: true`, and `webSecurity` is left at its default (main.js:479-484). The print window is sandboxed with no preload (main.js:457-461).
- **Preload** exposes only fixed `ipcRenderer.invoke` wrappers with hard-coded channel names. There is no generic `invoke(channel)` and no `ipcRenderer` passthrough (preload.cjs:3-175). One handler is not exposed (`imports:rollback-preview`).
- **Password hashing**: scrypt (Node defaults N=16384, r=8, p=1), 16-byte random salt, 64-byte key, constant-time compare via `crypto.timingSafeEqual` (authService.js:23-33). The strength policy (8+ characters, upper, lower, digit) is enforced on change, recovery and admin reset.
- **Login lockout** itself works: after 5 failures the account is locked for 30 minutes and a correct password is refused while locked (t3 part B, "correct login while locked -> null"). Lock and login events are audited.
- **The desktop session service is correct where it is used**: it is keyed by `webContents.id`, cleared on `destroyed` (main.js:509-511), on logout, and on a failed login. `requirePermission` overrides any payload `user_id` with the session user (desktopSessionService.js:66-69). A viewer is denied on `account-mapping:assign` (t2).
- **adminResetPassword design** (once imported): the actor comes from the session, self-reset is refused, the target gets `force_password_change = 1`, and the actor is audited correctly.
- **Print/HTML**: the print snapshot uses `cloneNode` with `textContent` for field values (App.jsx:1445-1470). Templates go through `renderToStaticMarkup`. The main-process print document escapes title, subtitle and breadcrumb (main.js:262-268). No `dangerouslySetInnerHTML` of raw DB strings was found.
- **Documents**: upload enforces an extension whitelist plus magic-byte check, and uses a sanitised random stored name under `documents/<company>/<module>/<year>` (documentService.js:14-55). View and download use the DB-stored path, not a renderer path. Download goes through a save dialog.
- **Update installer**: the path is restricted to the update folder by resolve + startsWith(sep) + `.exe` + exists (main.js:384-397).
- **shell.openExternal is never used.** `shell.openPath` is used only for app folders, stored documents and update EXEs.
- **Browser preview** (`client.js`, `browserFallbackApi.js`) is localStorage-only demo data. 79 mutating or sensitive methods are explicitly blocked (client.js:3-83) and unknown methods throw. It never touches SQLite or real data. Its `admin/admin123` login check is preview-only.

## 5. Not covered
- Running in real Electron (navigation, devtools availability in the packaged build, the actual `event.sender.id` values). The harness stubs Electron, but all handler logic is the real code.
- Whether DevTools can be opened in the packaged build (no menu role for it; default shortcuts not verified). This decides how practical SEC-1, SEC-2, SEC-7 and SEC-8 are for a local user without renderer compromise. Even through the normal UI, though, every role is checked as admin (SEC-1).
- The business correctness of go-live, reset and restore (the FK failure seen after a reset, and restore validation, are a known defect or other areas).
- Per-user company assignment does not exist in the schema, so company isolation per user was not assessed beyond noting that read channels accept any `company_id`.
