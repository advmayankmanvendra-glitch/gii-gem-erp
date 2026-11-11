# FSR-2A Restore and Rollback Plan

**Date:** 2026-07-24
**Plan status:** PASS
**Restore point status:** IN PROGRESS

## Intended Restore Point

| Item | Intended value |
|---|---|
| Branch | `phase-16-enterprise-crm-integration` |
| Baseline before stabilization | `ec197bebb7b2c6ad86801bc67060e4638c2eeace` |
| Lock commit | The commit containing the completed FSR-2A lock document set |
| Annotated tag | `fsr-2a-accounting-truth-lock-2026-07-24` |
| Tag message | `FSR-2A accounting truth locked: posting, statements, inventory, openings, financial-year continuity and exact money certified.` |
| Remote push | Required and remotely verified before FSR-2B begins |

The tag must point to the reviewed commit containing the verifier corrections,
runtime smoke-test corrections, all required lock documents, and the updated
risk register. It must not point to the older `ec197be` commit because that
commit does not contain the stabilization change set.

The annotated tag name is the stable restore-point identity. The lock documents
must not contain their own commit hash because amending the lock commit changes
that hash.

## Creation Sequence

1. Review `git diff` for scope, accounting, security, migration, and unrelated
   file risks.
2. Confirm only intended files are staged.
3. Commit with explicit owner authorization.
4. Re-run the lock verification gate if the committed tree differs from the
   verified tree.
5. Confirm `git status --short` is empty.
6. Confirm HEAD is the intended lock commit.
7. Create the annotated tag.
8. Verify the tag resolves to the lock commit.
9. Push the branch and tag only with explicit owner authorization.
10. Verify the remote branch and remote tag resolve to the same commit.

## Source Rollback

The source restore point allows a new recovery branch to be created from the
tag. Destructive reset, force-push, or overwriting the active worktree is not
part of this plan and requires separate approval.

## Database Rollback

Source rollback and database rollback are separate:

- a Git tag restores application source, not business data;
- an SQLite backup restores business data, not application source;
- the backup must be matched to a compatible application/schema version;
- integrity, accounting, financial, inventory, and migration checks must pass
  after restore; and
- no operational database may be overwritten without owner authorization.

## Migration 034 Boundary

Migration 034 is forward-moving and adds authoritative minor-unit columns while
retaining legacy REAL mirrors. An older application must not be assumed safe
after this migration. Until RMD-1 certifies downgrade behavior:

- do not downgrade an installed database;
- do not delete minor columns;
- do not rewrite legacy mirrors as a rollback substitute;
- restore a verified pre-migration database backup when true data rollback is
  required; and
- preserve the failed/migrated database as audit evidence.

## Recovery Verification

After any authorized source/data recovery, run sequentially:

```text
npm.cmd run lint:syntax
npm.cmd run build
npm.cmd run verify:fsr2a5c
npm.cmd run verify:fsr2a5b
npm.cmd run verify:fsr2a5a
npm.cmd run verify:fsr2a4
npm.cmd run verify:fsr2a3
npm.cmd run verify:fsr2a2
npm.cmd run verify:fsr2a1
npm.cmd run verify:financial-reports
npm.cmd run verify:erp
```

Then repeat the Electron accounting smoke test on a safe copy.

## Current Limitation

The conditional FSR-2B approval is not effective until the annotated tag
`fsr-2a-accounting-truth-lock-2026-07-24` points to the lock commit containing
the completed lock document set and is pushed. No external operational
database backup was created or verified in this programme. RMD-1, production
packaging, and production release remain BLOCKED.
