# Reports Directory — Evidence and Archive Policy

**Policy owner:** Architecture and Governance  
**Effective date:** 2026-08-21  
**Phase:** GGR-1 Governance and Graph Registry Reconciliation

## Purpose

This directory contains two different classes of material:

1. reviewed, immutable governance evidence that is explicitly allowlisted for Git tracking; and
2. local historical, operational or generated reports that remain intentionally outside version control.

`docs/architecture/report-evidence-disposition-manifest.json` is the authoritative GGR-1 inventory for the 316 files that were ignored and local-only at the accepted 2026-08-21 audit baseline. It records each file's path, size, SHA-256 checksum, disposition and successor or archive reason.

## Allowlisted Governance Evidence

The following historical reports were reviewed for secret, personal-data and runtime-output risk and are approved for tracking without content rewriting:

- `audit-database-init-architecture.md` — dated architecture-audit evidence cited by the Permanent Architecture Rules audit log;
- `phase-ag-1-audit-intelligence-graph-report.md` — AG-1 implementation-phase evidence; and
- `phase-kg-5-manual-graph-report.md` — KG-5 implementation-phase evidence.

These are historical snapshots. Their old versions, graph counts and conditional lock wording must not be read as current registry truth. The KG-5 phase report proves implementation and verification, not the missing separate Rule 27 stabilization step.

`phase-ggr-1-governance-graph-reconciliation-report.md` is the current phase report and is separately allowlisted.

## Intentionally Archived Local Reports

Files classified `INTENTIONALLY_ARCHIVED` remain physically retained in this local `reports/` archive with their checksums recorded in the manifest. They are not current governance authority and must not be committed without a separate content and sensitivity review.

Sixteen source-derived Tally, migration, accounting-mapping and operational-reset reports are marked `PRIVATE_SOURCE_DERIVED`. They contain company/source identifiers, workstation paths, source entity counts or database row counts and must not be added to Git unredacted. Any off-device archive requires encrypted, access-controlled storage and a checksum receipt under a separate approved action.

## Superseded Reports

Files classified `SUPERSEDED` remain preserved for historical traceability but are replaced by the successor document recorded in the manifest. They must not be used for current status, readiness, graph counts or architecture authority.

## Formally Excluded Outputs

Files classified `FORMALLY_EXCLUDED` are mutable generated results or runtime certificates. They are not governance evidence. In particular, local go-live or production-readiness certificates cannot override the accepted ERP production-readiness result of BLOCKED.

## Safety

- Do not use `git add -f reports/*` or broadly unignore this directory.
- Do not delete or move archived files without separate approval.
- Do not treat a local report's presence as proof that its claims were committed, pushed, deployed or production-verified.
- Production readiness remains BLOCKED until the accepted audit findings and required corrective programme sequence are cleared.
