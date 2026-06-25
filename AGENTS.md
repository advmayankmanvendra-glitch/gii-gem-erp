# PERMANENT ARCHITECTURE AND FUNCTIONAL SAFETY RULES FOR GII GeM ERP

Apply these rules before implementing any new phase.

## 1. Audit First

Before coding:
- Audit the current implementation.
- Identify existing module boundaries.
- Identify reusable components.
- Identify existing services.
- Identify existing reports.
- Identify existing data models.
- Identify existing route/view keys.
- Identify affected IPC/preload APIs.
- Check git status and existing uncommitted files.

Do not duplicate existing logic.

## 2. App.jsx Protection

Do not add major new business logic directly into App.jsx.

App.jsx should remain primarily:
- Layout shell
- Navigation shell
- Route orchestration
- Global state coordination only where already established

New functionality must go into feature modules, screens, components, services, utils or config.

## 3. Modular Placement

Use correct folders:

Renderer features:
- src/renderer/features/accounting
- src/renderer/features/inventory
- src/renderer/features/operations
- src/renderer/features/reports
- src/renderer/features/gst
- src/renderer/features/importExport
- src/renderer/features/help
- src/renderer/features/settings
- src/renderer/features/dashboards

Shared UI:
- src/renderer/components

Utilities:
- src/renderer/utils

Configuration:
- src/renderer/config

Documentation:
- src/docs

Reports:
- reports/

## 4. Preserve Core Logic

Do not change unless explicitly instructed:
- Accounting formulas
- Voucher posting math
- GST calculations
- Inventory valuation
- Profitability formulas
- Database schema
- IPC channel names
- Preload API names
- Route/view keys
- Save/post/reversal behavior
- Existing workflows
- Existing records

## 5. Reuse Before Creating

Before creating any:
- new screen
- new report
- new component
- new service
- new database table
- new IPC channel
- new helper

first search whether an existing one can be safely reused or extended.

## 6. No Silent Refactors

Do not reorganize unrelated modules while implementing a phase.

Only refactor if:
- required for the phase
- small and controlled
- documented in the audit report

## 7. Renderer Safety

Do not place accounting, GST, inventory, profitability, migration or posting logic inside screen components.

Screens should:
- display data
- collect user input
- call existing APIs/services
- show validation and guidance

Business rules should remain in:
- services
- backend/database modules
- utilities
- controlled validators

## 8. Database and Data Safety

Do not directly write to sensitive tables from generic UI code.

Sensitive areas include:
- vouchers
- voucher_lines
- ledger_entries
- receivables
- payables
- GST
- stock ledger
- financial years
- audit log
- backup/restore

Use existing controlled services and IPC methods.

## 9. Company Context Safety

Every company-linked transaction must respect current company context.

Check:
- selected company is visible
- company_id is passed
- no silent fallback to first company
- reports filter by company
- imports map to selected company
- All Companies View remains read-only unless explicitly changed

## 10. Navigation and UX Safety

After any navigation or drilldown change, verify:
- route opens correctly
- breadcrumb is correct
- active sidebar item is correct
- recents/favorites are not broken
- back button works
- screen scroll starts at top
- same-page actions scroll/focus to relevant section
- no blank screen after login

## 11. Print and Export Safety

If touching reports, vouchers, invoices or documents, verify:
- Print button opens ERP print/preview, not only browser print
- Export works
- CSV/XLSX headers are correct
- amounts do not show wrong currency symbols
- printed vouchers/bills contain company, date, number, party, totals and status

## 12. Import Safety

For import/migration work:
- never import directly into live tables without validation
- use staging/preview first
- show row-wise errors
- show duplicate reasons
- allow skip/update/map/rename where relevant
- block unsafe import
- audit log import action
- do not create stock ledger from master import unless explicitly approved

## 13. Error Guidance

Any error shown to user must explain:
- what failed
- where it failed
- which screen/section/field needs attention
- what the user should do next

Avoid generic errors like:
- "Something went wrong"
- "Validation failed"
- "SQLite error"

## 14. Verification Commands

After every phase run:

```
npm.cmd run lint:syntax
npm.cmd run build
npm.cmd run verify:accounting
npm.cmd run verify:financials
```

If the phase touches controls, posting, approval, inventory or operational flow, also run:

```
npm.cmd run verify:controls
npm.cmd run verify:voucher-inventory
npm.cmd run verify:flow
npm.cmd run verify:phase10
```

## 15. Desktop Smoke Test

After build, test in Electron desktop app, not browser preview only.

Minimum smoke test:
- app opens
- login works
- dashboard loads
- sidebar works
- target screen opens
- changed feature works
- no blank screen
- no console/runtime error
- back/navigation works
- current company remains visible
- report/export/print works if touched

## 16. End-of-Phase Report

Every phase must generate a report in reports/ including:
- phase name
- files changed
- components added/changed
- services added/changed
- reports added/changed
- IPC/preload impact
- route/view key impact
- database impact
- business logic preserved confirmation
- verification command results
- desktop smoke test result
- known limitations
- safe to lock: Yes/No

## 17. Stop Rules

Stop and wait for review if:
- build fails twice
- accounting verification fails
- financial verification fails
- app opens blank after login
- route/view key breaks
- database schema mismatch appears
- existing records become inaccessible
- import/posting/backup becomes unsafe
- fix requires changing accounting or posting math

Do not continue to the next phase after a failed verification.

## 18. Global UX Governance

Follow `docs/architecture/global-ux-governance-standard.md` before implementing navigation, toolbar, keyboard, search, help, feedback, table, modal, empty-state, AI guidance, or recovery changes.

This standard is mandatory for new or changed UX work, but it does not require retrofitting every existing screen unless a phase explicitly includes that scope.

UX changes must remain modular:
- do not add large UX dictionaries, screen manuals, toolbar rules or interaction engines into `src/renderer/App.jsx`
- place reusable UX services in `src/renderer/utils` or feature modules
- place reusable presentation in `src/renderer/components`
- place screen/help metadata in `src/renderer/config` or the relevant feature folder

Every UX phase report must include a UX compliance checklist and clearly state any known gaps.

## 19. Phase Governance Pipeline

No Codex or OpenCode phase should begin directly with implementation.

Every implementation phase must follow this fixed pipeline:

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

Pipeline rules:
- Architecture Audit must identify current module boundaries, reusable code, data models, services, reports, IPC/preload impact, route impact, and existing uncommitted changes.
- Architecture Compliance Check must confirm App.jsx protection, modular placement, reuse-before-create, and preservation of core logic.
- UX Compliance Check must apply `docs/architecture/global-ux-governance-standard.md` where the phase touches user interaction, navigation, help, tables, forms, search, error guidance, print/export, or dashboard behavior.
- Implementation must be limited to the approved scope.
- Verification must run the required commands for the affected scope.
- Desktop Smoke Test must be completed for functional/UI phases, or explicitly marked not applicable for documentation-only phases.
- Git Commit should happen only after verification passes and the user has not asked to keep changes uncommitted.
- Git Tag should be used only for major locked baselines or major phase milestones.
- Lock Note must state what is stable, what is out of scope, and what future changes require a separate phase.
- If any step fails, stop and do not proceed to the next phase.

## 20. Final Checklist Before Saying Done

Before final response, confirm:

- [ ] git status reviewed
- [ ] only intended files changed
- [ ] no unrelated files modified
- [ ] no App.jsx business logic added unnecessarily
- [ ] no route keys changed
- [ ] no IPC/preload names changed
- [ ] no database schema changed unless approved
- [ ] current company context preserved
- [ ] sidebar/breadcrumb/recents still work
- [ ] affected screen opens
- [ ] affected action works
- [ ] relevant drilldown works
- [ ] relevant print/export works if touched
- [ ] lint passed
- [ ] build passed
- [ ] verify:accounting passed
- [ ] verify:financials passed
- [ ] desktop smoke test completed or clearly marked not completed
- [ ] report generated
- [ ] safe to lock stated clearly
