# RMD-0 Release and Data Continuity Baseline Audit

**Programme:** Release, Migration and Data Continuity  
**Phase:** RMD-0 - Release and Data Continuity Baseline Audit  
**Date:** 2026-07-22  
**Mode:** Audit only  
**Repository:** GII GeM ERP  
**Branch:** `phase-16-enterprise-crm-integration`  
**Auditor:** Codex independent verification  

## 1. Executive Conclusion

The ERP has a working local SQLite persistence path, a verified same-version
Electron restart path, and a functional active backup/restore service. Source
development uses the repository root, while packaged NSIS and portable runs are
intended to use Electron `userData`. A packaged runtime database was confirmed
by file metadata at:

`C:\Users\TM Savera\AppData\Roaming\gii-gem-erp\database\gii_gem_erp.db`

The database was not opened, copied, restored, or altered during this audit.

The repository is not yet a release-safe migration baseline. The current working
tree contains substantial uncommitted path, identity, migration, backup-manager,
release-history, and auto-updater work. Most of the new continuity modules are
present but are not connected to application startup. The active application
still uses the inline migration mechanism in `init.js` and the established
`services/backup.js` implementation.

The principal release blockers are:

1. The active runtime does not persist or enforce a schema version.
2. The compatibility guard, migration runner, legacy migrator, enhanced backup
   manager, and release-history service are not wired into startup.
3. No automatic pre-migration or pre-update backup exists.
4. No historical upgrade fixture or two-version upgrade has been certified.
5. The current installer artifacts predate the current updater/signing config,
   point to a different update provider, and are unsigned.
6. Legacy database paths and multiple-database ambiguity are not detected.
7. Independent computers have independent SQLite files and no synchronization.

**Executive decision:** RMD-1 is justified, but it must begin only after the
current dirty working tree is reconciled and a named, verified database-programme
baseline and external backup are established under Architecture Rules 26 and 27.

## 2. Evidence Classification

This audit uses three evidence levels:

| Evidence | Meaning |
|---|---|
| Repository evidence | Current source, configuration, scripts, and artifacts inspected on 2026-07-22. |
| Runtime evidence | Commands and disposable Electron tests reproduced during this audit. |
| Historical evidence | Existing reports or older artifacts; not treated as a current pass unless reproduced. |

No live operational database was opened. File-system metadata was read for the
packaged AppData location and existing installer artifacts only.

## 3. Source-Control and Release Baseline

| Field | Current value | Assessment |
|---|---|---|
| Branch | `phase-16-enterprise-crm-integration` | Active branch |
| HEAD | `ee675a4b85279a9260020bea192b0546aa11e57b` | `fix(fsr-2a4): implement perpetual inventory GL bridge + certification hardening` |
| Upstream | `origin/phase-16-enterprise-crm-integration` | Local branch ahead by 1 commit |
| Tag at HEAD | None | No release/baseline tag identifies current HEAD |
| Working tree | Dirty | 10 tracked files modified and 13 untracked files before this report |
| Application version | `0.1.0-internal-test` | Internal test, not a production semantic release |
| Product name | `GII GeM ERP` | Stable identity candidate |
| Package name | `gii-gem-erp` | Controls observed userData identity |
| App ID | `in.gestureindiainfrastructure.giigemerp` | Controls Windows installer identity/GUID derivation |
| Electron | `^37.0.0`; built artifact uses 37.0.0 | Current framework |
| electron-builder | `^26.15.3` | NSIS/portable builder |
| better-sqlite3 | `^12.2.0` | Electron native SQLite driver |
| electron-updater | `^6.8.9` | Present only in the uncommitted working tree |
| Installer output | `dist-installer` | Existing artifacts dated 2026-07-18 |

### 3.1 Build and installer configuration

- `build`: Vite renderer build.
- `pack:win`: Vite build plus unpacked Windows application.
- `dist:win`: Vite build plus NSIS and portable executables.
- NSIS is assisted (`oneClick: false`), not forced per-machine
  (`perMachine: false`), and permits installation-directory selection.
- Portable and NSIS targets are both configured.
- `extraResources` packages `database/gii_gem_erp.db` as a starter database.
- The current working tree adds a generic stable feed at
  `https://releases.gestureindia.com/erp/`.
- The current working tree adds `forceCodeSigning: true` and
  `verifyUpdateCodeSignature: true`, but no certificate identity is configured
  in the repository.
- No Git commit, build date, or release identity is embedded by the active build.
  `getBuildManifest()` can read environment variables for Git metadata, but that
  module is not wired into packaging or startup.

### 3.2 Existing artifact mismatch

The existing 2026-07-18 artifacts are not proof of the current working-tree
release configuration:

| Artifact evidence | Result |
|---|---|
| Setup EXE | Present, version `0.1.0-internal-test` |
| Portable EXE | Present, version `0.1.0-internal-test` |
| `latest.yml` | Present |
| Packaged `app-update.yml` | Uses GitHub provider for `advmayankmanvendra-glitch/gii-gem-erp`, not the current generic feed |
| Setup Authenticode | `NotSigned` |
| Portable Authenticode | `NotSigned` |
| Current signed build | Not generated or verified in this audit |

## 4. Database Path Resolution

### 4.1 Active resolver chain

`main.js` calls `configureRuntimeStorage()` before database initialization:

```text
resolveDataRootForPackaged()
  -> GII_GEM_ERP_DATA_ROOT, when set
  -> app.getPath("userData"), when app.isPackaged
  -> process.cwd(), otherwise

databasePath(root)
  -> <root>/database/gii_gem_erp.db
```

The requested name `GI_SQLITE_DB_PATH` does not exist in the repository. The
implemented override is the root-level variable `GII_GEM_ERP_DATA_ROOT`.

### 4.2 Complete path matrix

| Mode | Expected and actual root | Responsible code | Persistence and reinstall | Blank/duplicate risk | Identity |
|---|---|---|---|---|---|
| Source development | Repository `process.cwd()` unless override is set | `databasePathResolver.js`, `connection.js` | Persistent in repository; uninstall not applicable | A different working directory or empty override can create another database | Created only when full `main.js` startup runs |
| Electron development | Repository `process.cwd()` because `app.isPackaged` is false | `main.js` plus resolver | Persistent in repository | Same process.cwd/override risk | Full app startup creates UUID and app/environment metadata |
| Packaged NSIS | Electron `app.getPath("userData")`; observed `%APPDATA%\gii-gem-erp` | `resolveDataRootForPackaged()` | External to installation; default NSIS configuration does not request AppData deletion | If target is absent, starter copy is attempted; if no starter is found, initialization can create/seed a fresh DB | Full app startup persists UUID |
| Portable | Also Electron `userData`; `PORTABLE_EXECUTABLE_DIR` only disables auto-update | Resolver and updater configuration | Data remains in AppData after deleting portable EXE | Installed and portable builds can silently share the same database on one machine | Same userData identity path when package identity is unchanged |
| Tests | Mixed: explicit temp roots in many scripts; CWD in default initialization; some scripts hard-code repository DB | Individual scripts | Depends on script cleanup | High ambiguity if a script does not pass a root/override | Often absent because scripts call `initializeDatabase()` without `main.js` |
| Environment override | `<GII_GEM_ERP_DATA_ROOT>` in every mode | `databasePathResolver.js` | Persistent at operator-selected root | High: changing or clearing the variable silently selects another DB and may bootstrap it | Created on full app startup at the selected root |
| Legacy locations | None configured; `knownLegacyPaths()` returns `[]` | `databasePathResolver.js`, unused `legacyDatabaseMigrator.js` | Not applicable | Existing old candidates are not detected or reconciled | Not evaluated |
| Backup | `<runtime-root>\backups\gii_gem_erp_<timestamp>.db` | Active `services/backup.js` | Follows selected root | Restore stays within selected root, but wrong root selection means wrong DB target | Active backup has no metadata identity |
| Pending restore | `<runtime-root>\database\pending_restore.db` and `.json` | Active `services/backup.js` | Applied on next startup | Scoped to current root | JSON records filename/time, not schema/app/database identity |
| Documents | `<runtime-root>\documents\<company|common>\<module>\<year>` | `documentService.js` | Follows selected root | Same root-switch risk as DB | Company ID is part of folder selection |
| Exports/reports/logs | `<runtime-root>\exports`, `reports`, `logs` | Main/services | Follows selected root | Same root-switch risk | No central instance manifest |
| Packaged starter DB | `<resources>\database\gii_gem_erp.db` | electron-builder and `copyBundledDatabaseIfMissing()` | Read-only source inside application package | Copied only when target DB is absent; packaging the wrong repository DB propagates its contents to new installations | Starter identity/content is not governed by a release manifest |
| Manual update folder | `%USERPROFILE%\Documents\GII GeM ERP Updates` or `GII_GEM_ERP_UPDATE_DIR` | `main.js` | External to app/userData | Does not select ERP database | Not applicable |

### 4.3 Multiple-database conclusions

- Repository database: possible and expected in source/Electron development.
- Program Files/resources database: packaged as a starter source, but the active
  connection is not opened there.
- AppData database: expected in NSIS and portable packaged mode.
- Changed CWD database: possible in non-packaged mode.
- Changed environment-root database: possible in every mode.
- Candidate detection: absent. The selected resolver path wins silently.
- Apparent data loss can therefore occur when the launch mode, CWD, package
  identity, or environment override changes even though an older DB still exists.

## 5. Database Initialization Architecture

`initializeDatabase(root)` currently performs this sequence on every open:

```text
openDatabase(root)
  -> WAL mode and foreign keys ON
migrate(db)
  -> core CREATE TABLE IF NOT EXISTS SQL
  -> 31 inline named migrations (003 through 033)
seed(db)
  -> seed routines guarded by record existence/emptiness
addPhase5AccountingControls(db)
  -> also called inside migration 006
```

Across `src/main/database`, the static audit found 72 `CREATE TABLE IF NOT
EXISTS` occurrences, one generic `ALTER TABLE` statement used by column guards,
14 `CREATE INDEX IF NOT EXISTS` statements, no trigger creation, and no `DROP
TABLE` statement. Schema construction is distributed between `init.js` and
`schemaDefinitions.js`.

### 5.1 Open-mode distinction

| Required distinction | Current behavior | Classification |
|---|---|---|
| Fresh database | Same initializer creates core schema, runs migrations, and seeds | PARTIALLY IMPLEMENTED |
| Existing database | Same initializer reruns idempotent DDL and skips recorded migrations | IMPLEMENTED AND VERIFIED |
| Old database upgrade | Inline migrations apply if their names are absent | PARTIALLY IMPLEMENTED |
| Damaged database repair | Some missing-column/table guards repair omissions; no corruption-repair workflow | PARTIALLY IMPLEMENTED |
| Backup restore | Separate service replaces file, then initializer runs | IMPLEMENTED AND VERIFIED |
| Newer-schema database | Active startup has no refusal gate | ABSENT |

### 5.2 Migration capability classification

| Capability | Classification | Evidence |
|---|---|---|
| Schema version | PARTIALLY IMPLEMENTED | `_meta` helpers exist, but active startup does not set `schema_version` |
| `PRAGMA user_version` | ABSENT | Disposable DB remained `0` |
| `schema_migrations` table | IMPLEMENTED AND VERIFIED | Active table recorded 31 migrations |
| Ordered migration files | ABSENT | Migrations are inline callbacks in `init.js` |
| Ordered inline migrations | IMPLEMENTED AND VERIFIED | `runMigration()` executes named callbacks in source order |
| Migration checksums | CONTRADICTORY | Unused runner has checksum fields; active ledger does not; applied-check logic cannot validate already-applied checksums |
| Applied history | IMPLEMENTED AND VERIFIED | Migration names and timestamps recorded |
| Transactional migration execution | IMPLEMENTED AND VERIFIED | Active `runMigration()` wraps callback plus ledger insert in `db.transaction()` |
| Failure rollback | PARTIALLY IMPLEMENTED | Current migration transaction rolls back that migration, but no pre-migration backup or cross-migration recovery plan exists |
| Compatibility check | PARTIALLY IMPLEMENTED | Guard module exists but has no startup caller |
| Newer-schema refusal | ABSENT | Guard is unused and active DB has no schema version |
| Minimum/maximum schema | PARTIALLY IMPLEMENTED | Constants exist only in unused guard, both fixed at `1` |
| Direct-upgrade limits | ABSENT | No supported-from version matrix |
| Historical fixtures | ABSENT | No prior-version database fixtures found |
| Automatic pre-migration backup | ABSENT | No startup integration |
| Automatic post-migration checks | ABSENT | Verification scripts are manual, not startup-gated |

### 5.3 Contradictory working-tree modules

The uncommitted `migrationRunner.js` expects `schema_migrations` columns such as
checksum, application version, duration, and success. The active table created
by `init.js` contains only `id`, `migration_name`, and `applied_at`. `CREATE TABLE
IF NOT EXISTS` does not upgrade that existing table. The new runner is therefore
not safely interchangeable with the active ledger without an explicit bridge
migration.

The compatibility guard treats schema `0` as fresh, but normal current databases
can have operational data and still report schema `0` because active startup
never sets the schema key. It must not be wired in until legacy/current schema
identification is designed and verified.

## 6. Backup and Restore

### 6.1 Active implementation

The application imports `src/main/services/backup.js`:

- Live backup performs `wal_checkpoint(FULL)` and awaits the better-sqlite3
  backup API.
- A raw filesystem copy remains as a fallback when no live DB handle is supplied.
- Restore closes the main DB first, rejects paths outside the backup directory,
  clears WAL/SHM files, copies the selected backup, and reinitializes the DB.
- Locked-file restore can be staged as a pending restore for next startup.
- `backup:restore` is permission-guarded by `restore_backup`, which is admin-only.
- Backup creation is permission-guarded but available to several operational roles.

### 6.2 Capability matrix

| Requirement | Active result | Status |
|---|---|---|
| better-sqlite3 backup API | Used for live backup | IMPLEMENTED AND VERIFIED |
| Raw copy fallback | Present | IMPLEMENTED BUT UNVERIFIED for an active WAL DB |
| WAL handling | Checkpoint on live backup; WAL/SHM removed around restore | IMPLEMENTED AND VERIFIED |
| Close DB before restore | Main handler closes DB | IMPLEMENTED AND VERIFIED |
| Backup integrity check | No integrity check in active service | ABSENT |
| Backup metadata | Filename, path, size, and time returned in memory only | PARTIALLY IMPLEMENTED |
| App/schema/database ID metadata | Not persisted with active backup | ABSENT |
| Pre-update backup | No updater integration | ABSENT |
| Pre-migration backup | No migration integration | ABSENT |
| Retention | No active retention policy | ABSENT |
| Restore role protection | Admin-only restore permission | IMPLEMENTED AND VERIFIED |
| Path traversal prevention | Canonical backup-root check | IMPLEMENTED AND VERIFIED |
| Wrong-root protection | No database identity/root confirmation | ABSENT |
| Post-restore accounting check | Not automatic | ABSENT |
| Post-restore compatibility check | Not automatic | ABSENT |

The uncommitted `backupManager.js` contains metadata, integrity, pre-migration,
and retention concepts, but it is unused. Its backup filenames do not end in
`.db` while its list routine filters for `.db`, and its live backup handling does
not match the Promise-based better-sqlite3 API used successfully by the active
service. It is not an implemented replacement.

Disposable runtime evidence: the existing stability smoke passed 29/29 checks,
including active backup create/list/restore and balanced accounting after
restore. This proves the active same-version disposable path, not restore of a
historical or incompatible database.

At audit time there were zero `.db` backup files in both the repository backup
folder and the observed packaged AppData backup folder.

## 7. Installer and Updater Architecture

### 7.1 Manual internal updater v1

The existing `updates:*` flow is a manual release-folder scanner and installer
launcher. It scans `%USERPROFILE%\Documents\GII GeM ERP Updates` (or
`GII_GEM_ERP_UPDATE_DIR`) for an EXE, optionally reads `latest.json`, compares
filename/manifest versions, and opens the selected installer with `shell.openPath`.

It does not download an update and is not a true automatic updater.

### 7.2 New automatic updater in the working tree

The uncommitted `update:*` flow uses `electron-updater` and provides check,
download, progress, status, and `quitAndInstall` APIs. It is enabled only for an
installed packaged runtime, not development and not portable. Source checks
enforce HTTPS and the exact configured host, require update availability before
download, require completed download before installation, and expose state
through serializable IPC DTOs.

`verify:auto-updater` passed 18/18 source-contract checks. This is not an
end-to-end feed, signature, download, installation, migration, or rollback test.

### 7.3 Updater capability determination

| Capability | Current determination |
|---|---|
| Download update | Implemented in uncommitted source; runtime feed not verified |
| Discover manual installer | Implemented in active manual updater |
| Replace binaries in place | Intended through NSIS/electron-updater; not executed |
| Preserve AppData | Expected by path/config; not certified through uninstall/update |
| Backup before install | Absent |
| Close DB before install | General `before-quit` closes DB; no updater-specific verification |
| Block install during posting | Absent |
| Run migrations after update | Startup inline migrations run normally, but no release migration orchestration |
| Detect failed post-update startup | Absent |
| Roll back update | Absent |
| UAT/stable channels | Stable plus environment-selected channel is coded; UAT feed/manifests not verified |
| Release manifests | electron-updater `latest.yml` and manual `latest.json` concepts exist; current artifact is stale |
| Release history | Service exists but is unused |
| Unsafe downgrade refusal | Absent |
| Portable updates | Automatic updater is explicitly disabled for portable |
| Install on exit | `quitAndInstall(false, true)` is coded; not executed |
| Signed update | Config now requires signing; available artifacts are unsigned |

## 8. Uninstall and Reinstall Behavior

- The installed application and database are separated: binaries install under
  the selected application directory, while runtime data uses AppData.
- `deleteAppDataOnUninstall` is not enabled. The installed electron-builder
  version defaults it to false, so source/config evidence indicates AppData
  should remain. Actual uninstall was prohibited and not tested.
- Reinstall startup copies the packaged starter DB only when the target DB does
  not exist. It should not overwrite an existing target DB.
- If the DB is missing and no bundled starter is found, normal initialization can
  create and seed a fresh database.
- Application version changes do not change the resolver path.
- A change to package name/product identity can create a different Electron
  `userData` folder and make existing data appear lost.
- A change to `appId` changes installer/update identity and can break in-place
  upgrade behavior even if AppData remains.
- Installed and portable builds currently resolve to the same AppData root on a
  machine; the portable executable is not data-portable.

### 8.1 Identities that must remain stable

1. `appId`: `in.gestureindiainfrastructure.giigemerp`
2. Product name: `GII GeM ERP`
3. Package name: `gii-gem-erp`
4. Database file: `gii_gem_erp.db`
5. Runtime folder structure: `database`, `documents`, `backups`, `exports`,
   `reports`, `logs`
6. Persistent database UUID after RMD-1 adoption
7. Company and environment identity semantics
8. Update channel and signing publisher identity

## 9. Multi-Computer Data Consistency

The current model is local, single-machine SQLite:

| Question | Current answer |
|---|---|
| Independent DB per workstation | Yes |
| Central ERP API | No |
| Shared central database | No |
| Record synchronization | No |
| Conflict resolution | No |
| Controlled import/export merge | Import/export exists, but not as a multi-master synchronization protocol |
| Branch isolation | No governed `branch_id` tenancy layer |

Updating application code can align application binaries and schema behavior; it
cannot synchronize transactions independently created on different computers.

The risks are distinct:

- Application/schema inconsistency: different code/schema expectations.
- Business-record inconsistency: independent valid DBs contain different orders,
  vouchers, stock, receipts, and balances.
- Company/branch inconsistency: company IDs are local; branch tenancy is absent.
- Backup inconsistency: restoring one machine does not restore another.
- Portable/installed inconsistency: paths can be shared on one computer and
  independent on separate computers, with no user warning.

Interim operating rule: use one designated machine and one persistent runtime
root for real data, maintain verified external backups, and treat exports as
read-only exchange unless a governed import is explicitly run. Do not place a
writable SQLite file on an SMB/NFS network share. The planned safe progression is
an API-owned SQLite service, followed by a central transactional database when
security, tenancy, backup, and infrastructure are ready.

## 10. Safe Disposable Runtime Test

No real DB was opened or copied. Disposable roots were created inside ignored
workspace runtime folders and removed after testing.

### 10.1 Same-version initialization and restart

| Observation | Result |
|---|---|
| Disposable DB path | `<repo>\runtime\rmd0-audit-7f6a9c\database\gii_gem_erp.db` |
| Table count before full app | 70 |
| Recorded migrations | 31 |
| `PRAGMA user_version` | 0 |
| `_meta` before full app | Absent |
| Accounts/vouchers/ledger rows | 29 / 7 / 16 |
| Ledger control totals | Debit 2,877,500; credit 2,877,500 |
| Integrity/FK | `ok`; 0 violations |
| Second accounting process | Same counts and control totals |
| Full Electron startup | Opened login/default-password gate against disposable root |
| `_meta` after full app | Present |
| Database UUID/app metadata | Present; version `0.1.0-internal-test`, environment `development` |
| Schema/last migration metadata | Absent |
| Silent second DB | None found under disposable root |

### 10.2 True Electron restart

A second disposable root was started in Electron twice. Both launches opened the
same login screen. The same database file creation timestamp was retained, WAL
state was reopened, and no second `.db` file appeared. Authentication was not
automated. Both Electron process trees were terminated after observation and the
temporary root was removed.

### 10.3 Backup/restore

`scripts/stability-edit-backup-smoke.js` created its own disposable root, passed
29/29 checks, verified active backup create/list/restore, reloaded reports, and
confirmed debit equals credit after restore. The script removed its test root.

### 10.4 Historical two-version upgrade

**NOT EXECUTED.** No governed prior-version database fixture and matching signed
application artifact were available. Existing 2026-07-18 installers were not run
because they are unsigned, stale relative to current source, and installing over
the current ERP was prohibited.

## 11. Verification Commands

| Command | Environment | Exit/result | Scope and limitation |
|---|---|---|---|
| `npm.cmd run lint:syntax` | Repository source | 0, PASS | Syntax only |
| `npm.cmd run build` | Repository source | 0, PASS | Vite build; 258 modules |
| `npm.cmd run verify:auto-updater` | Repository source | 0, PASS 18/18 | Static contract, not network/install |
| `npm.cmd run verify:database-path` | Electron script; disposable workspace folder | 0, PASS 6/6 | Verified source/CWD functions; did not simulate packaged `app.isPackaged` |
| `GII_GEM_ERP_DATA_ROOT=<disposable> npm.cmd run verify:accounting` | Disposable DB | 0, PASS | Run twice; persistence and balanced totals |
| `GII_GEM_ERP_DATA_ROOT=<disposable> npm.cmd run verify:financials` | Disposable DB | 0, PASS | Trial balance, P&L, balance sheet, receivables, payables, GST/TDS |
| `GII_GEM_ERP_DATA_ROOT=<disposable> npm.cmd run verify:controls` | Script-created OS temp DB | 0, PASS 12/12 | Includes backup validation |
| `GII_GEM_ERP_DATA_ROOT=<disposable> npm.cmd run verify:voucher-inventory` | Script-created OS temp DB | 0, PASS | Voucher/inventory controls |
| `npm.cmd exec -- electron ... scripts/stability-edit-backup-smoke.js` | Script-created disposable DB | 0, PASS 29/29 | Includes restore and post-restore accounting |
| `GII_GEM_ERP_DATA_ROOT=<disposable> npm.cmd start` | Full Electron development runtime | Window opened twice | Shell timeout is expected for long-running GUI; visual startup passed, no login performed |
| `node <temporary DB inspector>` | Disposable DB | 1, WARNING | Node ABI 137 did not match Electron-built better-sqlite3 ABI 136; Electron runtime inspection succeeded |
| `npm.cmd run verify:migration` | Not run | NOT VERIFIED | Script hard-codes repository DB; opening the real source DB was disallowed |
| `npm.cmd run verify:erp` | Not run | NOT VERIFIED | Writes a report and includes broad scripts with mixed DB-root behavior; not safe for this audit-only scope |
| `npm.cmd run dist:win` | Not run | NOT VERIFIED | Would generate release artifacts; no signing certificate/feed test was approved |

Native-module note: better-sqlite3 is correctly rebuilt for Electron ABI 136.
Direct Node 24.16.0 requires ABI 137, so DB scripts must run through the governed
Electron command or the module must be deliberately rebuilt for Node and then
rebuilt back for Electron.

## 12. Gap Matrix

| Capability | Current status | Repository evidence | Runtime evidence | Risk | Required phase |
|---|---|---|---|---|---|
| Persistent external DB path | Implemented and verified | Packaged resolver uses `userData` | AppData metadata and disposable Electron restart | Medium | RMD-1 lock and tests |
| Stable app identity | Implemented but unverified across upgrade | appId/product/package fixed | Existing AppData folder observed | High if changed | RMD-1 identity contract |
| Legacy path detection | Absent | `knownLegacyPaths()` returns `[]`; migrator unused | None | High | RMD-1 |
| Multiple-DB ambiguity detection | Absent | Resolver selects one path silently | Multiple modes proven possible | High | RMD-1 |
| Database identity UUID | Partially implemented | `_meta` and UUID helper; main startup caller | Present after full disposable app start | Medium | RMD-1 |
| Fresh bootstrap separation | Partial | Same initializer migrates and seeds every open | Fresh/reopen works | Medium | RMD-1 |
| Migration ledger | Implemented and verified | Active inline `runMigration()` | 31 rows | Medium | Preserve and bridge in RMD-1 |
| Ordered migrations | Partial | Inline order, no migration files/version catalog | Current sequence passes | Medium | RMD-1 |
| Migration checksum | Contradictory/unused | New runner only; active table lacks fields | None | High | RMD-1 |
| Schema compatibility guard | Present but unused | No caller from main/init | Schema key absent | Critical | RMD-1 |
| Newer-DB refusal | Absent | Active open bypasses guard | Not tested | Critical | RMD-1 |
| Pre-migration backup | Absent | No startup integration | None | Critical | RMD-1 |
| Post-migration accounting checks | Manual only | Verification scripts exist | Disposable checks pass | High | RMD-1 |
| Application release manifest | Partial | build publish + manual manifest concepts | Stale artifact provider mismatch | High | RMD-2 release pipeline |
| Application release history | Present but unused | Service has no caller | None | Medium | RMD-2 |
| Update channels | Partial | Stable default plus env channel | No live feed test | Medium | RMD-2 |
| NSIS in-place update | Intended, unverified | electron-updater and NSIS config | Not executed; artifacts unsigned | Critical | RMD-2 |
| Install-on-exit | Implemented but unverified | `quitAndInstall(false, true)` | Not executed | High | RMD-2 |
| Active-transaction update lock | Absent | No update quiescence guard | None | High | RMD-2 |
| Automatic pre-update backup | Absent | No updater/backup wiring | None | Critical | RMD-2 |
| Upgrade fixtures | Absent | No historical DB fixtures | Two-version test not executed | Critical | RMD-1 |
| Failed-migration recovery | Partial | Per-migration transaction only | Failure path not injected | High | RMD-1 |
| Backup metadata/integrity | Absent in active service | Enhanced manager unused | Active restore works same-version | High | RMD-1 |
| Signed release artifacts | Config only | force signing in dirty source | Existing artifacts unsigned | Critical | RMD-2 |
| Central multi-user model | Planning only | Architecture plan, no API/sync | None | Critical for shared use | Separate central-data programme |

## 13. Data-Loss and Divergence Risks

### Critical

1. Older/newer application and DB combinations are not actively rejected.
2. Updates and migrations do not automatically create a verified backup.
3. Current release artifacts are unsigned and do not match current updater config.
4. No historical fixture proves upgrade continuity.
5. Independent workstations diverge immediately and cannot be reconciled by an
   application update.

### High

1. Changing CWD or `GII_GEM_ERP_DATA_ROOT` can silently select/bootstrap another DB.
2. Legacy paths are not searched, so existing data can appear lost.
3. Restore lacks active integrity, identity, schema, and accounting gates.
4. The packaged starter is whatever repository DB exists at build time; an
   unsanitized DB could be distributed to every new installation.
5. New migration/backup modules conflict with or bypass active structures if
   connected without bridge work.
6. Package/app identity changes can create a new userData location.

### Medium

1. Portable and installed builds share AppData on the same machine despite
   different user expectations.
2. No release-history ledger records installed versions and migrations.
3. Direct Node and Electron native-module ABIs differ.
4. No current backup file existed at either observed runtime root during audit.

## 14. Files Likely Affected by RMD-1

RMD-1 should remain a database architecture phase. Expected files are:

- `src/main/database/databasePathResolver.js`
- `src/main/database/connection.js`
- `src/main/database/databaseIdentity.js`
- `src/main/database/migrationRunner.js`
- `src/main/database/databaseCompatibilityGuard.js`
- `src/main/database/legacyDatabaseMigrator.js`
- `src/main/database/init.js` only for controlled orchestration/bridge wiring
- `src/main/services/backup.js` as the proven active base
- `src/main/services/backupManager.js` only if reconciled into the active service
- `src/main/services/releaseHistoryService.js`
- `src/main/main.js` for startup ordering and explicit refusal UX
- `scripts/verify-migration.js`
- `scripts/verify-database-path.js`
- New disposable historical fixtures and upgrade verification scripts
- Package scripts only where needed to expose safe tests
- This architecture report and the eventual RMD-1 phase/lock reports
- DG-1/database graph only if RMD-1 changes database architecture metadata

No renderer business feature, accounting formula, voucher math, report SQL,
route key, or App.jsx refactor belongs in RMD-1.

## 15. Recommended RMD-1 Scope

**RMD-1 - Migration and Compatibility Foundation**

1. Reconcile and commit or deliberately discard the current uncommitted RMD
   modules; do not build on an ambiguous mixed state.
2. Establish the required named database-programme baseline, push it, and make an
   external offline copy under Architecture Rule 26.
3. Define immutable application, data-root, DB filename, and database identity contracts.
4. Define a deterministic legacy-path list and multi-candidate selection/refusal UX.
5. Bridge the existing 31-row migration ledger into one versioned/checksummed
   format without rewriting history.
6. Assign a truthful schema version to existing operational databases using
   structural fingerprinting, not an assumption that schema `0` means fresh.
7. Wire a compatibility guard before mutable startup SQL.
8. Add automatic verified pre-migration backup using the proven active backup API.
9. Add migration transaction/failure records, recovery instructions, and
   post-migration integrity/accounting checks.
10. Create sanitized historical fixtures for at least the last supported schema,
    current schema, corrupted migration, and newer-than-app schema.
11. Certify fresh install, same-version restart, supported upgrade, failed
    migration recovery, newer-schema refusal, restore, and no-second-DB behavior.
12. Keep updater delivery/signing in RMD-2 after RMD-1 is locked.

## 16. Explicit Readiness Verdicts

| Readiness question | Verdict | Condition/basis |
|---|---|---|
| Safe to preserve data on the same computer after reinstall | **YES WITH CONDITIONS** | Keep package/product identity and data root stable; do not delete AppData; actual uninstall/reinstall was not executed |
| Safe to install a patch over the existing NSIS installation | **NO** | Unsigned stale artifact, no pre-update backup, no schema gate, and no end-to-end updater test |
| Safe to upgrade an older database schema | **NO** | No historical fixture, version bridge, checksum enforcement, or certified upgrade path |
| Safe to reject incompatible application/database versions | **NO** | Guard is unused and active DB schema version is absent |
| Safe for controlled UAT using one persistent database | **YES WITH CONDITIONS** | One designated machine/root, no update, verified backup before UAT, current-version only |
| Safe for several independent testing databases | **YES WITH CONDITIONS** | Explicit unique roots, disposable/test data only, no expectation of synchronization |
| Safe for shared real-data multi-user operation | **NO** | No central API/database or synchronization |
| Safe to begin RMD-1 Migration and Compatibility Foundation | **YES WITH CONDITIONS** | First reconcile dirty changes and complete named baseline, verification, push, and external backup |

## 17. Governance and Lock Status

- Primary classification: Architecture.
- Secondary classifications: Packaging and Deployment, Health and Recovery,
  Governance, Security.
- Dependencies satisfied for audit: Yes.
- Application implementation changed: No.
- Database/schema changed: No.
- IPC/preload changed by this audit: No.
- Route/view keys changed: No.
- Accounting/business logic changed: No.
- Enterprise Intelligence Layer registry reviewed: Yes.
- Graph structure changed: No; no graph update required for this audit-only phase.
- Desktop smoke: Disposable Electron startup and restart completed to login gate;
  no authentication or business workflow was performed.
- Production readiness: Internal Testing.
- Safe to lock RMD-0 audit: Yes, after review of the documented warnings.
- Safe to begin release packaging: No.
- Commit/push/tag performed: No.

