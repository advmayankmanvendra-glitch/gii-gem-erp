# PERMANENT ARCHITECTURE AND FUNCTIONAL SAFETY RULES FOR GII GeM ERP

Version: 3.1

Apply these rules before implementing any new phase.

## Governance Layer Hierarchy

Every implementation phase must comply with:
- Layer 1: Permanent Architecture Rules for engineering, modularization, `App.jsx`, IPC, database and verification.
- Layer 2: Global UX Governance for navigation, toolbar, keyboard, search, help, feedback, tables and accessibility.
- Layer 3: Product Governance for feature approval, ERP evolution, AI boundaries, roadmap, release maturity and production readiness.

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

Run verification commands sequentially when they access the same SQLite database unless parallel execution is explicitly known to be safe.

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

If a phase modifies navigation, Help Assistant, ERP Intelligence Center, ERP Health Center, Import/Export, document workflows, dashboard, runtime behavior, backup or restore, perform a manual Electron click-through of the affected workflow. Browser preview alone is not sufficient.

## 16. End-of-Phase Report

Every phase must generate a report in reports/ including:
- phase name
- feature classification
- dependency assessment
- dependencies satisfied: Yes/No
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
- production readiness classification
- production readiness gate result
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

## 19. Product Governance

Every proposed ERP feature must first answer whether it improves:
- accounting accuracy
- inventory integrity
- operational traceability
- audit readiness
- management decision support
- user productivity

Do not approve features simply because they are technically possible.

Priority order:
1. Accounting Integrity
2. Inventory Integrity
3. Operational Integrity
4. Audit Evidence
5. Decision Support
6. User Productivity
7. AI Guidance
8. Controlled Automation

AI may explain, guide, recommend, summarize, prioritize and predict.

AI must never silently post, reverse, delete, restore, approve, alter accounting or alter inventory unless a future controlled phase explicitly permits it.

Every new feature should identify its Product Maturity Stage:
- Transaction Processing
- Operational Control
- Decision Support
- Predictive Intelligence
- Controlled AI Assistance

## 20. Phase Governance Pipeline and Git Governance

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
- Git commits should represent completed, verified, reviewable work.
- Git Tag should be used only for stable recovery points, major milestones, locked baselines or major phase milestones.
- Do not create Git tags for every implementation phase.
- Lock Note must state what is stable, what is out of scope, and what future changes require a separate phase.
- If any step fails, stop and do not proceed to the next phase.

## 21. Feature Classification

Every implementation phase must declare:
- Primary Category
- Secondary Categories, if any
- Why the category applies
- Whether the work affects more than one category

Allowed categories:
- Architecture
- UX
- Accounting
- Inventory
- Operations
- Reporting
- Import / Export
- Intelligence
- AI Guidance
- Health & Recovery
- Security
- Performance
- Packaging & Deployment
- Governance

If one phase touches multiple high-risk categories, split the phase unless the user explicitly approves a combined scope.

## 22. Dependency Assessment

Before implementation, identify prerequisite:
- modules
- services
- APIs and IPC/preload methods
- reports
- database structures
- governance documents
- completed phases
- locked baselines

Every phase report must state:

```text
Dependencies Satisfied: Yes / No
```

If No, document:
- missing dependency
- limitation
- accepted workaround, if approved
- risk of proceeding
- whether implementation should stop

Do not implement features that depend on unfinished core functionality unless explicitly approved and documented.

## 23. Production Readiness Gate

A phase is not production-ready merely because coding is complete.

Evaluate readiness using these gates:
- implementation completed
- verification passed
- desktop smoke test completed where applicable
- accounting verification passed
- financial verification passed
- git status reviewed
- git commit completed where user approved committing
- git tag created where appropriate
- documentation updated
- phase report generated
- lock note completed where applicable
- UAT completed where required
- limitations documented
- safe-to-lock recommendation recorded

Classify readiness as:
- Prototype
- Internal Testing
- Beta
- Release Candidate
- Production Ready

Only classify a feature as Production Ready after all required gates are satisfied.

## 24. Final Checklist Before Saying Done

Before final response, confirm:

- [ ] git status reviewed
- [ ] only intended files changed
- [ ] no unrelated files modified
- [ ] feature classification recorded
- [ ] dependency assessment recorded
- [ ] dependencies satisfied stated
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
- [ ] production readiness classification recorded
- [ ] production readiness gate result recorded
- [ ] safe to lock stated clearly
- [ ] Enterprise Intelligence Layer referenced where applicable
- [ ] graph-registry.json updated if graph structure changed
- [ ] relevant graph schemas remain backward compatible

## 25. Enterprise Intelligence Layer Governance

The Enterprise Intelligence Layer is a controlled architectural asset defined in `docs/architecture/enterprise-intelligence-layer.md`.

### 25.1 Definition

The Enterprise Intelligence Layer consists of all structured knowledge graphs (BRAIN-1, KG-1, RG-1, DG-1, WG-1, AG-1) and is documented in `repository/graph-registry.json`.

### 25.2 AI Consumption Rules

Future AI tools shall:

1. Read `repository/graph-registry.json` first to discover available graphs.
2. Determine which graph(s) are required for the current task.
3. Load only required graph(s) — avoid loading all graphs when one suffices.
4. Avoid repository-wide source scans whenever graph data is sufficient.

### 25.3 Schema Changes Require Governance Approval

- No graph schema may change without version increment.
- Breaking changes (remove/rename required fields, change semantics) require Major version increment and full review.
- Additive changes (new optional fields, new enums) are allowed in minor versions.
- The `compatibility` section of each schema documents allowed vs. breaking changes.

### 25.4 Every Future Graph Must

1. Register itself in `repository/graph-registry.json`
2. Declare dependencies on existing graphs
3. Declare compatibility with existing graph schemas
4. Provide a validation audit pack in `scripts/verify-audit.js`
5. Provide regeneration instructions in its schema documentation
6. Follow the Enterprise Intelligence Layer schema contract (include all required top-level fields: `schemaVersion`, `graphId`, `generatedAt`, `owner`, `description`, `dependencies`, `relationships`, `risk`, `metadata`, `statistics`, `compatibility`, `futureExtensions`)

### 25.5 Phase Requirements

Every implementation phase must:

1. Load the graph registry to understand current architecture state.
2. Load relevant graphs for navigation and analysis before modifying any source code.
3. Reference the Enterprise Intelligence Layer in the phase report.
4. Update affected graphs if the phase changes any architecture element.
5. Verify all active graphs pass their audit packs after the phase.
