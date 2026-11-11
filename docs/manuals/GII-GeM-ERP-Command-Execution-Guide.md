# GII GeM ERP — Command Execution Guide

**Version:** 1.0  
**Audience:** System Administrators  
**Platform:** Windows (PowerShell 5.1)  
**Last Updated:** July 2026

---

## 1. Overview

GII GeM ERP is an Electron + React desktop application with SQLite (better-sqlite3) backend. All commands are invoked via `npm.cmd run <script>` from the project root. This document describes every npm script, the build and verification pipelines, database commands, recovery sequences, and the development workflow.

---

## 2. Script Reference Table

| Script | Purpose | When to Run | Expected Output |
|---|---|---|---|
| `lint:syntax` | Node syntax check on key main-process files, preload, and all verification scripts | Before every commit; before every build | Exit code 0, no errors printed |
| `dev` | Start Vite dev server + Electron concurrently with hot reload | During development | Vite dev server on `http://127.0.0.1:5173`, Electron window opens |
| `build` | Build renderer with Vite (production bundle) | Before packaging; after every renderer change | Output written to `dist/` folder |
| `start` | Launch Electron in production mode (reads from `dist/`) | After build, for manual smoke test | Electron window opens with built renderer |
| `preview` | Preview the built Vite bundle in browser | Testing production build without Electron | Browser opens `http://127.0.0.1:4173` |
| `db:init` | Initialise/reset SQLite database — creates all tables, accounts, seed data | First run; after schema changes; to reset DB | Database created at `database/gii_gem_erp.db` |
| `rebuild:electron` | Rebuild native modules (better-sqlite3) for current Electron version | After `npm install`; after Electron version change | Native module recompiled for Electron |
| `rebuild:node` | Rebuild better-sqlite3 for Node.js (for scripts running outside Electron) | When native module fails in standalone scripts | Module rebuilt for system Node |
| `pack:win` | Build + package as unpacked Windows app | Testing installer layout | Output in `dist-installer/` (unpacked) |
| `dist:win` | Build + create Windows installer (NSIS) and portable exe | Creating release artifacts | `GII-GeM-ERP-Setup-*.exe` and `GII-GeM-ERP-Portable-*.exe` in `dist-installer/` |
| `verify:accounting` | Verify ledger balancing — all vouchers post correctly, no orphan entries | After any voucher/posting code change; part of verification pipeline | Summary: pass/fail counts |
| `verify:accounting:production` | Same as above with production profile | Production environment audit | Same format, stricter thresholds |
| `verify:financials` | Verify GST, receivables, payables, P&L and balance sheet reconciliation | After billing/payment/GST code changes | Summary: pass/fail counts |
| `verify:financials:production` | Same with production profile | Production audit | Same format, stricter thresholds |
| `verify:controls` | Verify financial year controls, policy assumptions, protected workflows | After year-end/opening/control changes | Summary pass/fail |
| `verify:voucher-inventory` | Verify voucher dependency chains and inventory integration | After stock/inventory code changes | Summary pass/fail |
| `verify:phase10` | Verify Phase 10 inventory automation scripts | After inventory automation changes | Summary pass/fail |
| `verify:flow` | Verify controlled operational flow end-to-end | After workflow/operational changes | Summary pass/fail |
| `verify:production-readiness-sql` | Validate SQL queries for production readiness | Before deployment | Issues reported per query |
| `verify:fk-constraints` | Validate foreign key integrity across the database | After schema changes | Constraint violations listed |
| `verify:safe-delete` | Verify safe-delete rules and cascading behaviour | After deletion logic changes | Pass/fail per rule |
| `verify:screen-actions` | Verify screen action handlers (Node-based, no Electron) | After UI/action handler changes | Pass/fail per action |
| `verify:knowledge` | Validate knowledge base integrity (Node-based) | After knowledge base changes | Report output |
| `verify:audit` | Run audit pack on all graph registries (Node-based) | After architecture changes | Audit report |
| `verify:erp` | Full ERP verification suite (Node-based, composite) | Comprehensive smoke test | Combined report |
| `test-data:pack-v1` | Generate a pack of test data for validation | Setting up test environments | Database populated with test records |

---

## 3. Build Pipeline

The complete build pipeline for producing a Windows installer:

```
Step 1: Clean
  git clean -fdx                 # Remove untracked files and folders
  Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force dist-installer -ErrorAction SilentlyContinue

Step 2: Install
  npm install                    # Install all dependencies

Step 3: Rebuild Native Modules
  npm.cmd run rebuild:electron   # Rebuild better-sqlite3 for Electron

Step 4: Lint
  npm.cmd run lint:syntax        # Verify all entry files parse correctly

Step 5: Initialize Database
  npm.cmd run db:init            # Create/reset SQLite database with seed data

Step 6: Build Renderer
  npm.cmd run build              # Vite production build → dist/

Step 7: Verification
  npm.cmd run verify:accounting
  npm.cmd run verify:financials
  npm.cmd run verify:controls
  npm.cmd run verify:voucher-inventory
  npm.cmd run verify:flow

Step 8: Package
  npm.cmd run dist:win           # Create NSIS installer + portable exe
```

Each step must succeed before proceeding to the next. Do not skip verification.

---

## 4. Verification Pipeline

Run verification scripts **sequentially** (they access the same SQLite database):

```
Step 1:  npm.cmd run lint:syntax
Step 2:  npm.cmd run build
Step 3:  npm.cmd run verify:accounting
Step 4:  npm.cmd run verify:financials
Step 5:  npm.cmd run verify:controls
Step 6:  npm.cmd run verify:voucher-inventory
Step 7:  npm.cmd run verify:flow
Step 8:  npm.cmd run verify:phase10          # if inventory automation changed
Step 9:  npm.cmd run verify:erp               # full composite suite
```

On any failure:
1. Read the error output to identify the failing check.
2. Fix the issue.
3. Re-run from the failed step (not from the beginning).
4. If the fix touches core accounting, re-run `verify:accounting` and `verify:financials`.

---

## 5. Database Commands

### 5.1 Initialise Database

```
npm.cmd run db:init
```

- Executes `src/main/database/init.js` in Electron headless mode.
- Creates all tables defined in `schemaDefinitions.js`.
- Seeds master data via `seedData.js` (items, accounts, departments, suppliers, employees).
- Creates financial years and opening balances.
- **WARNING:** Destructive — will overwrite the existing database file. Backup first.

### 5.2 Manual Backup

```
node -e "const { createBackup } = require('./src/main/services/backup.js'); console.log(createBackup());"
```

Or use the Backup & Restore screen in the application (Settings > Backup & Restore).

Backup files are written to `<project>/backups/` with filename format:
`gii_gem_erp_<YYYY-MM-DDTHH-MM-SS-ms>.db`

### 5.3 List Backups

Backups are listed in-app under Settings > Backup & Restore. Manual listing:

```
Get-ChildItem -Path ".\backups\*.db" | Sort-Object LastWriteTime -Descending
```

### 5.4 Restore Backup

From the application:
1. Navigate to Settings > Backup & Restore.
2. Select a backup from the list.
3. Click Restore.
4. Restart the application when prompted.

The restore mechanism copies the selected backup over `database/gii_gem_erp.db`. WAL and SHM files are removed before and after the copy to prevent corruption.

### 5.5 Pending Restore Mechanism

On restore, the system writes a `pending_restore.json` and `pending_restore.db` to the `database/` folder. On next application start, `applyPendingRestore()` in `backup.js` completes the swap. This ensures the database is never replaced while the application holds an open connection.

---

## 6. Recovery Sequence for Common Failures

### 6.1 Database Corrupt / Won't Open

```
Step 1:  cd <project-root>
Step 2:  node -e "const { createBackup } = require('./src/main/services/backup.js'); createBackup();"
         (if DB opens at all)
Step 3:  npm.cmd run db:init                   # Replace with fresh DB
Step 4:  Restore from most recent backup
```

### 6.2 Build Fails

```
Step 1:  npm.cmd run lint:syntax                # Check syntax first
Step 2:  npm.cmd run build                       # Read Vite error output
Step 3:  Fix reported errors
Step 4:  Re-run build
```

### 6.3 Verification Fails

```
Step 1:  Identify which script failed and read the failing check name
Step 2:  git diff                                # Review uncommitted changes
Step 3:  git log --oneline -5                     # Review recent commits
Step 4:  If regression identified:
           git checkout <last-known-good-commit>
           npm.cmd run build
           npm.cmd run verify:accounting
           npm.cmd run verify:financials
Step 5:  If issue is in current work, fix and re-verify
```

### 6.4 Native Module (better-sqlite3) Errors

```
Step 1:  npm.cmd run rebuild:node               # Rebuild for Node
Step 2:  npm.cmd run rebuild:electron           # Rebuild for Electron
Step 3:  If still failing:
           Remove-Item -Recurse -Force node_modules
           npm install
           npm.cmd run rebuild:electron
```

### 6.5 Application Opens Blank Screen

```
Step 1:  Open DevTools (Ctrl+Shift+I) in the Electron window
Step 2:  Check Console for errors
Step 3:  Check Network tab to confirm renderer loaded from dist/ or Vite
Step 4:  If using dev mode, verify Vite dev server is running on port 5173
Step 5:  npm.cmd run build                       # Ensure dist/ is up to date
Step 6:  npm.cmd run start                       # Launch with fresh build
```

### 6.6 Reset Operational Data

The `operationalResetService.js` provides controlled data reset via the application UI under Settings > Recovery. For a full reset:

```
Step 1:  Backup current database (Settings > Backup & Restore)
Step 2:  npm.cmd run db:init                     # Fresh database
Step 3:  Restore only master data if needed
```

---

## 7. Development Workflow

### 7.1 Hot Reload Mode

```
npm.cmd run dev
```

This runs two processes concurrently:
1. **Vite dev server** on `http://127.0.0.1:5173` — serves the React renderer with HMR (Hot Module Replacement).
2. **Electron** — loads the Vite dev server URL (`VITE_DEV_SERVER_URL` env variable).

Changes to renderer files (JSX, CSS) are reflected immediately via HMR without restarting Electron. Changes to main process files require restarting the `dev` script.

### 7.2 Browser Preview (Without Electron)

```
npm.cmd run dev
```

Then open `http://127.0.0.1:5173` in a browser. Note:
- Some Electron-specific APIs (file system, IPC, native dialogs) will not work.
- Use this for UI layout and component development only.
- Always perform a desktop smoke test in Electron before committing.

### 7.3 Production Preview

```
npm.cmd run build
npm.cmd run start
```

This launches Electron with the production build from `dist/`. Use this to verify:
- Assets are bundled correctly
- No missing file references
- IPC communication works end-to-end
- Native modules load correctly

### 7.4 Common Development Commands

```
npm.cmd run lint:syntax          # Quick syntax check
npm.cmd run build                # Rebuild renderer
npm.cmd run dev                  # Start dev mode
npm.cmd run start                # Run production build
npm.cmd run verify:accounting    # Quick accounting sanity
npm.cmd run verify:financials    # Financial reconciliation check
```

---

## 8. Environment Variables

| Variable | Used By | Purpose |
|---|---|---|
| `VITE_DEV_SERVER_URL` | `dev`, `start` | Tells Electron where to load the renderer from |
| `VERIFY_PROFILE` | `verify:accounting:production`, `verify:financials:production` | Switches to production verification thresholds |

---

## 9. Installer Build Output

| Artifact | Description | Location |
|---|---|---|
| `GII-GeM-ERP-Setup-<version>-<arch>.exe` | NSIS installer (per-user, customizable install path) | `dist-installer/` |
| `GII-GeM-ERP-Portable-<version>-<arch>.exe` | Portable executable (no install required) | `dist-installer/` |

---

## 10. Key Directories Reference

| Directory | Contents |
|---|---|
| `src/main/` | Electron main process, services, database layer |
| `src/renderer/` | React UI, feature modules, components |
| `src/preload/` | Preload script (`preload.cjs`) with contextBridge API |
| `scripts/` | Verification scripts, test data packer, smoke tests |
| `reports/` | Phase reports, audit reports, verification histories |
| `docs/` | Architecture docs, user guides, manuals |
| `database/` | SQLite database file (created at runtime) |
| `backups/` | Database backup files |
| `dist/` | Vite production build output |
| `dist-installer/` | Electron-builder installer output |

---

## 11. Script Details — GPU Flags

All database and verification scripts that use Electron apply these GPU-disabling flags to ensure headless operation on machines without GPU or in CI:

```
--disable-gpu
--disable-gpu-compositing
--disable-gpu-sandbox
--disable-accelerated-2d-canvas
--in-process-gpu
```

These flags prevent Electron from creating GPU contexts, which can hang or crash on headless systems or remote desktop sessions.
