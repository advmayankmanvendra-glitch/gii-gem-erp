# GII GeM ERP Phase Governance Pipeline

Status: Active standard  
Scope: All future Codex/OpenCode implementation phases  
Last updated: 2026-06-25

## Purpose

This standard prevents regressions by making every phase pass through audit, compliance, verification, smoke testing, source-control hygiene and lock documentation.

No future implementation phase should begin directly with coding.

## Mandatory Phase Workflow

```text
Idea
  -> Architecture Audit
  -> Architecture Compliance Check
  -> UX Compliance Check
  -> Implementation
  -> Verification
  -> Desktop Smoke Test
  -> Git Commit
  -> Git Tag (Major Phase Only)
  -> Lock Note
```

## 1. Idea

Capture the requested business or technical outcome in one sentence.

Clarify whether the phase is:
- audit only
- documentation only
- UI/UX only
- report/display only
- workflow enhancement
- accounting-sensitive
- inventory-sensitive
- import/migration-sensitive
- packaging/runtime-sensitive

## 2. Architecture Audit

Before coding, inspect:
- current module boundaries
- reusable components
- reusable utilities
- existing services
- existing reports
- existing data models
- route/view keys
- IPC and preload APIs
- database tables touched
- current git status
- existing uncommitted changes

Do not duplicate existing logic.

## 3. Architecture Compliance Check

Confirm before implementation:
- `App.jsx` is not receiving major new business logic
- new code belongs in the correct feature/module/component/utils/config folder
- core accounting, GST, inventory, profitability, schema, route and IPC rules are preserved
- implementation is limited to the approved phase scope
- no silent unrelated refactor is planned

## 4. UX Compliance Check

When the phase touches user interaction, apply `docs/architecture/global-ux-governance-standard.md`.

Check:
- navigation and back behavior
- scroll/focus behavior
- toolbar order
- keyboard shortcuts
- global versus local search
- processing feedback
- empty states
- table/grid row actions
- Help Mode versus Screen Guidance
- AI/intelligence safety
- recovery and confirmation behavior

## 5. Implementation

Implement only the approved scope.

Rules:
- preserve existing records
- keep changes small and module-scoped
- use existing services/components before creating new ones
- do not bypass controlled workflows
- do not directly write sensitive accounting or stock data from UI code

## 6. Verification

Minimum commands after every phase:

```powershell
npm.cmd run lint:syntax
npm.cmd run build
npm.cmd run verify:accounting
npm.cmd run verify:financials
```

Add these where relevant:

```powershell
npm.cmd run verify:controls
npm.cmd run verify:voucher-inventory
npm.cmd run verify:flow
npm.cmd run verify:phase10
```

If verification fails twice, stop and report.

## 7. Desktop Smoke Test

Functional/UI phases must be checked in the Electron desktop app.

Minimum smoke test:
- open app
- login
- confirm current company visible
- open affected screen
- use changed action
- verify navigation/back behavior
- verify relevant print/export if touched
- confirm no blank screen
- confirm no runtime error

Documentation-only phases may mark this step not applicable.

## 8. Git Commit

Commit only after verification passes, unless the user asks to keep the work uncommitted.

Commit message should state the phase and outcome.

Do not include runtime files, databases, backups, exports, logs, `dist`, or `node_modules`.

## 9. Git Tag

Tag only major locked baselines or major completed phases.

Do not tag minor documentation-only updates unless the user requests it.

## 10. Lock Note

Every lock note must include:
- module or phase name
- version
- locked date
- files/scope stabilized
- verification results
- trial balance status
- known limitations
- rule that future changes require a separate phase or critical bug fix

## Stop Conditions

Stop immediately if:
- build fails twice
- accounting verification fails
- financial verification fails
- app opens blank after login
- route/view key breaks
- current company context breaks
- database schema mismatch appears
- existing records become inaccessible
- backup/restore/import/posting becomes unsafe
- fix requires changing protected accounting or posting logic outside approved scope

## Phase Report Checklist

Every phase report must state:
- phase name
- audit result
- architecture compliance result
- UX compliance result where applicable
- files changed
- App.jsx impact
- database impact
- IPC/preload impact
- route impact
- verification command results
- desktop smoke test result
- git commit/tag status
- safe to lock: yes/no
- known limitations
