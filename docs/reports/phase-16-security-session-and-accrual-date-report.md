# Phase 16A and 16B Report: Backend Login Session, User Management and Expense Accrual Date

Date: 2026-10-07
Branch: `claude/project-thread-grlynv`
Source audit: repository audit of 2026-10-07 (gaps 5.1 and 5.2)

This report is stored in `docs/reports/` because `reports/*` is gitignored and the phase evidence should travel with the code.

---

## Phase 16B: Expense Accrual Posting Date (commit `3e9af8c`)

**Feature classification:** Primary Accounting. No secondary category.
**Approval:** Rule 4 forbids changing posting behaviour without explicit instruction. The user approved this change ("Fix it") on 2026-10-07.

**Problem.** `postExpenseAccrualsForOrder` dated each expense accrual voucher with the system date. A June order's expenses posted in October landed in October, and could fall into a different financial year. This was also why `scripts/desktop-functional-stabilization.js` failed: "Voucher JOURNAL-00001 missing from register".

**Change.** The accrual voucher and its posting date now use the supply order's `order_date`. If that is missing, they use the expense entry's `created_at` date, and only then today's date (`expenseAccrualDate`, `src/main/database/init.js`).

**Not changed:**
- Amounts, accounts and debit/credit lines.
- Vouchers that are already posted. Only entries with no `voucher_id` are ever posted.
- Schema.

**Behaviour note.** If the order date falls in a closed or locked financial year, posting is now refused by the existing financial-year controls instead of silently landing in the current year.

---

## Phase 16A: Backend Login Session and User Management

### Feature classification
- **Primary category:** Security.
- **Secondary categories:** UX (new screen), Governance (new verification script).
- **Accounting, posting, GST and inventory logic:** not touched.

### Dependency assessment
Dependencies Satisfied: **Yes**. The phase builds on the existing pieces:
- `users` table
- `authenticate` and `changeUserPassword`
- `ROLE_PERMISSIONS` and `enforcePermission`
- the audit log
- the Electron preload bridge

### Problem
Before this phase:
- Permission checks used whatever user id the screen sent, and fell back to the first active admin when none was sent. In practice every action ran as admin.
- 51 IPC handlers had no check at all and worked before login.
- There was no way to create users from the app.

### Changes

| Area | Change |
|---|---|
| `src/main/services/sessionService.js` (new) | Holds the logged-in user in the main process. A pending forced password change blocks data access. |
| `src/main/main.js` | Every IPC channel goes through `handle()`, which requires an active session except `auth:login`, `auth:change-password`, `auth:logout`, `meta:masters`, `meta:transactions` and `master-data:definitions`. `guarded()` now checks the session user's role. `audit:context` and document view/download log the session user. |
| `src/main/database/init.js` | `setPermissionActorResolver()`: when set by the desktop app, permission checks use only the session user and never fall back to admin. Scripts that call the database layer directly keep the old behaviour. Added `manage_users` to the Admin role. `passwordStrengthErrors` is now exported. Permission-denied messages now name the role, the action and what to do next. |
| `src/main/services/userAdminService.js` (new) | List, create and update users (name, role, status), and reset passwords. Rules: only a Super Admin can grant or alter Super Admin; you cannot deactivate yourself or remove your own admin role; the last active admin is protected; new and reset passwords force a change at next login and clear lockouts. Every action is audited (`module = user_management`). |
| `src/preload/preload.cjs` | Added `logout`, `listUsers`, `createUser`, `updateUser`, `resetUserPassword`. No existing names changed. |
| `src/renderer/api/client.js` | Browser preview blocks the new user actions. |
| `src/renderer/features/settings/UserManagementScreen.jsx` (new) | User table, edit, reset password and add user. Non-admins see an explanation instead of an error. |
| `src/renderer/config/navigation.js`, `src/renderer/App.jsx` | New route `user_management` under Settings. Render line added. Logout now ends the backend session. `App.jsx` gained 3 lines and no business logic. |
| `scripts/verify-security-session.js` (new), `package.json` | New `verify:security` check (16 checks). `lint:syntax` covers the new files. |

### Interface impact
- **IPC/preload:** new channels `auth:logout`, `users:list`, `users:create`, `users:update`, `users:reset-password`. No existing channel or preload name was changed or removed.
- **Routes:** new key `user_management`. No existing key changed.
- **Database:** no schema change.
- **Business logic preserved:** Yes. No accounting, GST, inventory, profitability or posting code was touched in 16A.

### Behaviour change users will notice
Roles are now enforced. Today only the seeded `admin` exists, so nothing changes until other users are created. A Viewer or Data Entry Operator can no longer post, approve or reverse, even though the screens still show those buttons. The backend refuses with a message that names their role.

### Verification results
Run in a Linux container under Node, one script at a time, on a fresh database.

| Command | Result |
|---|---|
| `lint:syntax` | Pass |
| `build` | Pass (existing warning: 1.2 MB chunk) |
| `verify:accounting` | Pass |
| `verify:financials` | Pass |
| `verify:controls` | Pass |
| `verify:voucher-inventory` | Pass |
| `verify:flow` | Pass |
| `verify:phase10` | Pass |
| `verify-company-context-isolation.js` | Pass |
| `verify-phase8b-voucher-proposals.js` | Pass |
| `verify:security` (new) | Pass, 16/16 |
| `desktop-functional-stabilization.js` | Pass (failed before 16B) |
| `stability-edit-backup-smoke.js` | Pass |
| `backup-restore-validation.js` | Pass |

### Desktop smoke test
Electron 37 on Linux under Xvfb, driven over the DevTools protocol.
- Login and the forced default-password change worked.
- No console errors before or after login.
- All 156 sidebar screens opened with no crash panel, no blank screen and no console errors.
- **User Management as admin:**
  - The page opened with the correct breadcrumb, active sidebar item and Recents entry.
  - Created a Viewer.
  - Trying to deactivate yourself was refused with guidance.
- Logout returned to the login screen.
- **Logged in as the new Viewer:**
  - Was forced to change the password.
  - User Management showed the "limited to administrators" panel.
  - Trial Balance still opened.

Not covered:
- The smoke test was not run on Windows.
- Print and export were not touched by this phase and were not re-tested.

### UX compliance checklist
- **Navigation:** Settings > User Management, with breadcrumb, Recents and Favorites working.
- **Error guidance:** messages say what failed, where (User Management > field) and what to do.
- **Destructive action:** password reset asks for confirmation.
- **Empty and denied states:** explained.
- **Known gap 1:** write buttons stay visible to roles that cannot use them. The backend refuses with guidance, but the buttons are not yet hidden.
- **Known gap 2:** no context-help entry yet for the new screen.

### Production readiness
- **Classification:** Beta.
- **Gates passed:** implementation, verification, accounting and financial verification, and smoke test (Linux).
- **Gates pending:** Windows desktop smoke test, UAT with real users and roles, git tag (not a major milestone).

### Known limitations
- The session has no idle timeout.
- Reloading the window (View > Reload) shows the login screen while the backend session stays open until the next login or logout.
- Audit attribution for some actions still records the user id the screen passes, because handler arguments were not rewritten. Permission decisions no longer depend on it.
- After a backup restore, the session user must exist in the restored database or actions are refused until the user logs in again.

### Safe to lock
Yes, after a Windows desktop click-through of login, logout and User Management.

### Lock note
- **Stable:** session enforcement, user administration and accrual dating.
- **Out of scope:** hiding buttons by role, idle timeout, audit attribution rewrite.
- **Changes to role permissions:** need a separate phase.
