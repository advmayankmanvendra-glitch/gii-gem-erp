# FSR-2A RMD-1 Dependency Assessment

**Date:** 2026-07-24
**Assessment mode:** Read-only
**RMD-1 status:** BLOCKED
**Production packaging:** BLOCKED

Release and Migration Data Continuity (RMD) 1 is a separate database
compatibility programme. FSR-2A migration fixtures prove the minor-unit
transformation, but they do not prove installed-version upgrade, interruption,
backup, restore, downgrade, or packaging behavior.

## Current Active Architecture

- Packaged runtime data resolves to Electron `app.getPath("userData")`.
- Development runtime resolves to the source project unless
  `GII_GEM_ERP_DATA_ROOT` is supplied.
- `initializeDatabase` creates required tables and runs inline named migrations
  in sequence.
- Migration 034 calls `addMoneyShadowColumns`.
- Each named migration executes in a SQLite transaction and records its name in
  `schema_migrations`.
- The active migration ledger is name-based and has no checksum, integer schema
  version, compatibility range, or application release manifest.
- The active startup path does not enforce newer-database refusal or automatic
  verified pre-migration backup.

## Compatibility Matrix

| Scenario | Result | Evidence and limitation |
|---|---|---|
| Fresh installation | PASS | Fresh temporary fixtures create all tables and 13 INTEGER minor columns |
| Existing database at migrations 001-033 | PASS WITH WARNINGS | Migration 034 is ordered, transactional, and idempotent in fixtures; no representative installed production copy was tested |
| Upgrade from pre-FSR money schema | PASS WITH WARNINGS | Legacy-to-minor parity passes controlled fixtures; historical disagreement handling is not production-executed |
| Repeated application startup | PASS | Migration 034 is skipped after ledger registration; Electron restart reused the disposable DB |
| Interrupted migration | FAILED | Per-migration transaction limits partial DDL, but no injected crash/restart recovery and verified automatic restore gate exists |
| Same-version backup restore | PASS WITH WARNINGS | Existing backup service supports restore; schema identity and post-restore accounting gates are not fully enforced |
| Portable executable | NOT STARTED | Build target exists; no upgrade or data-location test was run |
| Nullsoft Scriptable Install System (NSIS) installer | NOT STARTED | Build target exists; no in-place upgrade, signature, migration, or rollback test was run |
| Database in AppData | PASS WITH WARNINGS | Packaged path resolves to `userData`; packaged upgrade was not executed |
| Older repository-relative database | FAILED | No governed legacy-path discovery, ambiguity decision, and one-time relocation evidence |
| Rollback to older application | BLOCKED | Older code may read compatibility mirrors but cannot be assumed safe after newer schema/data changes |

## Required Release Contract

### Minimum Compatible Source Schema

The currently demonstrated upgrade source is a database that has successfully
completed migrations 001 through 033 and contains every legacy table/column
required by migration 034. No certified matrix maps older installer versions
to their exact source schema, so a broader minimum version must not be claimed.

### Migration Ordering

Migration 034 must execute after migration 033 and before any application
feature relies on authoritative minor values. The active sequence is
deterministic, but a release manifest must bind application version, source
schema, target schema, migration order, and checksums.

### Backup Prerequisite

Before migration on an installed database, the application must:

1. identify the exact database;
2. create an external or isolated backup;
3. verify SQLite integrity and backup readability;
4. record source schema and application version; and
5. stop migration if any prerequisite fails.

### Forward Compatibility

The current application can use legacy mirrors and authoritative minor columns
after migration 034. A future application may add migrations only through the
governed ordered process.

### Rollback And Mixed-Version Limitation

Downgrading to an older application is prohibited unless that version is
explicitly certified against the migrated database. Running old and new
application versions against copies of the same business data risks divergence
between legacy and minor values.

### Required Startup Gate

RMD-1 must enforce:

- database identity and resolved path;
- supported source and target schema;
- newer-database refusal;
- required pre-migration backup;
- migration checksum and one-time status;
- legacy/minor reconciliation;
- post-migration integrity and accounting checks; and
- clear recovery instructions on failure.

### Required Migration Manifest

The manifest must record application version, schema version, migration name,
checksum, prerequisites, affected tables, backup identifier, forward-only
status, validation commands, and rollback limitations.

## Release-Blocking Gaps

1. No active schema compatibility range or newer-database refusal.
2. No automatic verified pre-migration backup.
3. No representative historical installed-database upgrade fixture.
4. No injected interrupted-migration recovery certification.
5. No governed legacy database discovery/relocation and ambiguity control.
6. No downgrade certification.
7. No NSIS or portable upgrade and rollback certification.
8. No production historical reconciliation for FSR-R18/FSR-R19.

## Decision

FSR-2A accounting work may be locked independently of RMD-1 because its
prospective and controlled-fixture contracts pass. Production installer
packaging and release remain BLOCKED until RMD-1 and applicable historical-data
controls are separately implemented, stabilized, certified, and locked.
