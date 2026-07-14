# GII GeM ERP — Troubleshooting Guide

---

## 1. App Won't Start

| Symptom | Likely Cause | Solution | Prevention |
|---------|-------------|----------|------------|
| `npm start` shows build errors, then exits | Vite build failure | Run `npm run build` separately and inspect output. Fix ESLint / TypeScript errors. | Always run `npm run build` before `npm start`. |
| Blank white screen on launch | React render crash | Open DevTools (`Ctrl+Shift+I`), check Console for errors. Verify `index.html` is present in `dist/`. | Test with `npm run dev` (Vite dev server) during development. |
| App opens but shows "Cannot connect to database" | SQLite database path invalid | Check `appData` directory exists. Run `npm run electron:dev` to see path logs. | Never move the database file manually while the app is running. |
| Port 5173 / 4173 already in use | Previous dev server didn't close | Kill the orphaned Node process: `taskkill /F /IM node.exe` (Windows) or `killall node` (Linux/Mac). | Always stop dev servers with `Ctrl+C`. |
| Native module error: `better-sqlite3` not found | Node.js version mismatch or missing rebuild | Run `npm rebuild better-sqlite3`, then `npm run build`. | Use the exact Node.js version specified in `.nvmrc` or `package.json` engines. |
| App closes immediately after splash | Uncaught exception in main process | Run from terminal to see crash logs. Check `%APPDATA%/gii-gem-erp/logs/main.log`. | Keep logs enabled: set `LOG_LEVEL=debug` in environment. |

---

## 2. Database Errors

| Symptom | Likely Cause | Solution | Prevention |
|---------|-------------|----------|------------|
| `SQLITE_BUSY` — database is locked | Concurrent write from another process | Close other app instances. Wait 5 seconds and retry. | Only run one instance. Use `app.requestSingleInstanceLock()`. |
| `SQLITE_CORRUPT` — database disk image is malformed | Unexpected shutdown or disk error | Restore from last backup. If no backup, run `.recover` via `sqlite3` CLI. | Always exit app via File > Exit. Take regular backups. |
| `SQLITE_ERROR: no such table: items` | Migration did not run | Run `npm run db:init` to re-run migrations. Existing data may be lost — restore from backup after. | Never delete `migrations/` folder. Check migration order. |
| `SQLITE_CONSTRAINT: UNIQUE constraint failed` | Duplicate primary key (e.g. same invoice number) | Delete the offending record via Settings > Database > Raw Query (advanced). | Let the app auto-generate IDs. Avoid manual SQL inserts. |
| Migration failed: "already exists" | Migration partially applied | Run `npm run db:reset` to drop and re-create all tables (destructive). | Never interrupt `npm run build` or `npm run db:init`. |

---

## 3. Build Errors

| Symptom | Likely Cause | Solution | Prevention |
|---------|-------------|----------|------------|
| `vite build` fails with syntax errors | TypeScript / JSX issues | Run `npx tsc --noEmit` to find type errors. Fix all errors listed. | Enable strict TypeScript checks. Run lint before build. |
| `gyp ERR! rebuild better-sqlite3` failed | Missing C++ build tools | **Windows:** `npm install --global windows-build-tools`. **Linux:** `apt install build-essential python3`. **macOS:** `xcode-select --install`. | Keep build tools updated. Check Node.js compatibility. |
| Module not found: `electron-store` | Dependency not installed | Run `npm install` with `--legacy-peer-deps` if needed. | Use `npm ci` in CI to get exact dependency tree. |
| `ERR_OSSL_EVP_UNSUPPORTED` | OpenSSL 3.x + Webpack 4 incompatibility | Set `NODE_OPTIONS=--openssl-legacy-provider` in `.env`. | Upgrade to Vite (already used in this project). |

---

## 4. Runtime Errors

| Symptom | Likely Cause | Solution | Prevention |
|---------|-------------|----------|------------|
| `Cannot read property 'map' of undefined` | Data not loaded before render | Check that the component receives data. Use optional chaining: `data?.map()`. | Always initialise state with empty arrays / objects. |
| GST amount calculation is wrong | Incorrect HSN-GST rate mapping | Verify Item master record. Check `gstRate` field is numeric. | Use dropdown selectors for GST rate, never free text. |
| Navigation does not work / blank page | React Router path mismatch | Check `routes.tsx` for correct path definitions. Ensure `HashRouter` is used (Electron file protocol). | Use `HashRouter` for Electron apps. Test all routes after adding new pages. |
| Invoice PDF export shows garbled text | Missing font or encoding issue | Ensure fonts are bundled in `public/fonts/`. Use `pdf-lib` or `electron-print` correctly. | Bundle all required fonts. Test PDF generation on target OS. |
| Search / filter returns no results | Case-sensitive matching | Use `.toLowerCase()` in filter logic. Check column name spelling. | Standardise on case-insensitive searches. |

---

## 5. Data Errors

| Symptom | Likely Cause | Solution | Prevention |
|---------|-------------|----------|------------|
| Duplicate supply order numbers | Manual ID entry or race condition | Delete duplicate via Settings > Database. Add unique index. | Always use auto-generated IDs. |
| Wrong GST on invoice | Item master GST rate changed after order | Re-select item in order line. Recalculate invoice. | Lock GST rate in order line item snapshot. |
| Negative stock in warehouse | Over-delivery or data entry error | Create stock adjustment journal entry. Audit delivery quantities. | Add validation: delivery qty cannot exceed ordered qty. |
| Balance sheet does not match P&L | Double entry mismatch | Run `Reports > Verify Books`. Check for uncleared journal entries. Never edit posted transactions. | Use only app-provided transactions. No direct SQL edits. |

---

## 6. Feature Not Working

| Symptom | Likely Cause | Solution | Prevention |
|---------|-------------|----------|------------|
| "Generate Invoice" button is greyed out | Supply order is not in "Confirmed" status | Check order status in Operations > Supply Orders. Post it first. | Always post orders before generating invoices. |
| Payment not linking to invoice | Invoice already marked paid or cancelled | Verify invoice status. Unlink or create new payment. | Check invoice payment status before recording. |
| GST Register shows zero values | No invoices in selected period | Change the month filter. Verify invoices are "Posted" not "Draft". | Post invoices immediately after generation. |

---

## 7. Backup / Restore Fails

| Symptom | Likely Cause | Solution | Prevention |
|---------|-------------|----------|------------|
| Backup says "Disk full" | Insufficient space on target drive | Free up space or change backup location in Settings. | Monitor disk space. Set backup path to a drive with >500 MB free. |
| Restore fails: "Invalid backup file" | File is corrupted or not a valid SQLite DB | Try `.restore` via sqlite3 CLI. Use earlier backup. | Verify backup integrity after creation: `sqlite3 backup.db "PRAGMA integrity_check;"`. |
| "Permission denied" writing backup | App lacks write permission on backup directory | Change backup directory to user-writable location (e.g. Documents). | Never use system-protected folders as backup target. |

---

## 8. Recovery Procedures

### 8.1 Reset to a Known-Good Commit

```bash
git log --oneline -10          # find the last working commit hash
git reset --hard <hash>        # reset working tree
npm ci                         # clean install matching lockfile
npm run build
npm start
```

### 8.2 Restore a Database Backup

1. **Settings > Backup > Restore**
2. Browse to a `.db` backup file.
3. Confirm — the current database is replaced immediately.

*Manual restore:*

```bash
# Stop the application
cp "C:\Users\<you>\AppData\Roaming\gii-gem-erp\database.db" database.db.bak
copy /Y "D:\backups\gii-gem-erp-2026-07-12.db" "C:\Users\<you>\AppData\Roaming\gii-gem-erp\database.db"
# Restart the application
```

### 8.3 Safe Mode

Launch with safe mode to bypass renderer errors:

```bash
npm start -- --safe-mode
```

This disables all third-party integrations and loads a minimal UI for database repair.

### 8.4 Re-initialise Database

**Warning:** This DELETES all data. Only use as a last resort.

```bash
npm run db:init       # re-runs all migrations
# or
npm run db:reset      # drops and re-creates all tables
```

After re-init, restore from backup (Section 8.2).

---

## 9. Getting Help

| Resource | Where |
|----------|-------|
| Application logs | `%APPDATA%/gii-gem-erp/logs/` (Windows), `~/Library/Logs/gii-gem-erp/` (macOS) |
| Settings export | Settings > Export Config — saves all preferences to JSON |
| Report a bug | Open an issue at `https://github.com/your-org/gii-gem-erp/issues` |

Before reporting, run:

```bash
npm run verify      # checks environment, database integrity, and build status
```
