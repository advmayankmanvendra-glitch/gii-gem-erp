# Permanent Architecture Rules for GII GeM ERP

Version: 3.1  
Status: Active governance constitution  
Last updated: 2026-06-25

This document records the standing engineering and safety rules for GII GeM ERP. It is intended for developers, accountants, auditors, Codex, OpenCode, and future maintainers.

## Purpose

GII GeM ERP is a Windows Electron desktop ERP with React renderer, Node/Electron main process, SQLite database, local documents, backup/restore, accounting, GST, inventory, profitability, import/export, and company-context workflows.

Because the ERP affects books of accounts, GST, stock, receivables, payables, profitability, and audit history, every implementation must follow the rules below.

---

## Governance Layer Hierarchy

Every implementation phase must comply with all three governance layers:

**Layer 1: Permanent Architecture Rules**

Controls:
- engineering discipline
- modularization
- `App.jsx` protection
- IPC/preload stability
- database safety
- verification sequencing

**Layer 2: Global UX Governance**

Controls:
- navigation
- toolbar behavior
- keyboard behavior
- search
- help and screen guidance
- AI guidance presentation
- processing feedback
- tables and accessibility

**Layer 3: Product Governance**

Controls:
- feature approval
- ERP evolution
- AI boundaries
- roadmap priority
- release maturity
- production readiness

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

Do not add major new business logic directly into `src/renderer/App.jsx`.

App.jsx should remain primarily:
- Layout shell
- Navigation shell
- Route orchestration
- Global state coordination only where already established

New functionality must go into feature modules, screens, components, services, utils or config.

## 3. Modular Placement

Use correct folders:

**Renderer features:**
- `src/renderer/features/accounting`
- `src/renderer/features/inventory`
- `src/renderer/features/operations`
- `src/renderer/features/reports`
- `src/renderer/features/gst`
- `src/renderer/features/importExport`
- `src/renderer/features/help`
- `src/renderer/features/settings`
- `src/renderer/features/dashboards`

**Shared UI:** `src/renderer/components`

**Utilities:** `src/renderer/utils`

**Configuration:** `src/renderer/config`

**Documentation:** `src/docs`

**Reports:** `reports/`

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

```powershell
npm.cmd run lint:syntax
npm.cmd run build
npm.cmd run verify:accounting
npm.cmd run verify:financials
```

Verification commands that access the same SQLite database should run sequentially unless parallel execution is explicitly known to be safe.

Purpose:
- avoid transient SQLite database locked errors
- avoid migration lock conflicts
- avoid concurrent verification side effects

If the phase touches controls, posting, approval, inventory or operational flow, also run:

```powershell
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

If a phase modifies any of the following, perform a manual Electron click-through of the affected workflow:
- navigation
- Help Assistant
- ERP Intelligence Center
- ERP Health Center
- Import/Export
- document workflows
- dashboard
- runtime behavior
- backup and restore

Browser preview alone is not sufficient for these areas.

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

Every proposed ERP feature must satisfy product objectives before implementation begins.

Future features should answer:
- Does it improve accounting accuracy?
- Does it improve inventory integrity?
- Does it improve operational traceability?
- Does it improve audit readiness?
- Does it improve management decision support?
- Does it improve user productivity?

Do not approve features simply because they are technically possible.

Development priority should generally follow:
1. Accounting Integrity
2. Inventory Integrity
3. Operational Integrity
4. Audit Evidence
5. Decision Support
6. User Productivity
7. AI Guidance
8. Controlled Automation

AI may:
- explain
- guide
- recommend
- summarize
- prioritize
- predict

AI must never silently:
- post
- reverse
- delete
- restore
- approve
- alter accounting
- alter inventory

unless a future controlled phase explicitly permits it.

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

Every implementation phase must declare its primary feature category before implementation begins.

Allowed primary and secondary categories:
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

Every phase report must state:
- Primary Category
- Secondary Categories, if any
- Why the category applies
- Whether the work affects more than one category

Purpose:
- improve release planning
- simplify audit trails
- identify risk before implementation
- organize Git milestones and lock notes
- prevent accidental mixing of unrelated work

If a phase touches multiple high-risk categories, split the phase unless the user explicitly approves a combined scope.

## 22. Dependency Assessment

Before every phase, identify prerequisite dependencies.

Dependency assessment must check:
- prerequisite modules
- prerequisite services
- prerequisite APIs and IPC/preload methods
- prerequisite reports
- prerequisite database structures
- prerequisite governance documents
- prerequisite completed phases
- prerequisite locked baselines

Every phase report must state:

```text
Dependencies Satisfied: Yes / No
```

If dependencies are not fully satisfied, document:
- missing dependency
- implementation limitation
- accepted temporary workaround, if approved
- risk of proceeding
- whether the phase should stop before implementation

Do not implement features that depend on unfinished core functionality unless explicitly approved and documented.

Examples:
- AI Data Assistant depends on approved read-only data APIs.
- E-Invoice depends on stable GST invoice data and print/export structure.
- Inventory intelligence depends on reliable stock ledger and valuation reports.
- Packaging changes depend on stable runtime paths, backup paths and document paths.

## 23. Production Readiness Gate

A phase is not production-ready merely because coding is complete.

Production readiness must be evaluated separately from implementation completion.

Mandatory gates:
- implementation completed
- verification commands passed
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

Feature readiness must be classified as one of:
- Prototype
- Internal Testing
- Beta
- Release Candidate
- Production Ready

Rules:
- Prototype means the idea works but is not operationally certified.
- Internal Testing means developer verification passed but user workflow testing is incomplete.
- Beta means the feature is usable with known limitations.
- Release Candidate means the feature is ready for final business/user acceptance.
- Production Ready means verification, smoke testing, documentation, lock note and user acceptance requirements are satisfied.

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

## 25. Enterprise Intelligence Layer Governance

The Enterprise Intelligence Layer is a controlled architectural asset defined in `docs/architecture/enterprise-intelligence-layer.md`.

Future AI tools shall read the graph registry first, load only relevant graphs, avoid repository-wide scans where graph data is sufficient, and respect schema compatibility rules.

Every future graph must register itself, declare dependencies, declare schema compatibility, provide validation, provide regeneration instructions and follow the Enterprise Intelligence Layer schema contract.

Every implementation phase must reference the Enterprise Intelligence Layer where applicable and update affected graphs if graph structure changes.

## 26. Major Program Baseline Rule v2

Every major architectural program must begin by establishing a named baseline.

Covered programs include Renderer, Database, Workflow, CRM, AI and Mobile.

Baseline sequence:

1. Clean git working tree.
2. Verification pass.
3. Named git tag.
4. Remote push.
5. External backup.

Baseline tags must follow:

```text
<program>-baseline-<YYYY-MM-DD>
```

Minor subphases inside an already-baselined program do not require a new baseline.

## 27. Programme Stabilization and Certification Law

No major programme shall directly transition into another major programme.

Every programme must complete:

```text
Implementation
  -> Stabilization Programme
  -> Certification Programme
  -> Lock Report
  -> Architecture Gate Decision
  -> Next Programme
```

No step may be skipped.

If verification failure, production readiness failure, reset inconsistency, dashboard/source mismatch, accounting imbalance, database inconsistency, dirty architecture baseline, failed desktop certification or missing lock report remains unresolved, no subsequent major programme may begin.

## 28. GII Operational Chain of Command Governance Rule

All current government supply modules must follow the approved operational lifecycle before future module changes are made.

Approved core workflow:

```text
Lead / Tender
  -> Query / Requirement
  -> Quotation
  -> Negotiation
  -> Purchase Order / GeM Order
  -> Work Order
  -> Procurement Planning
  -> Supplier Purchase Orders
  -> Goods Receipt / GRN
  -> Inventory Reservation
  -> Delivery Challan
  -> Installation
  -> CRAC
  -> Sales Invoice / GST Invoice
  -> Department Receivable
  -> Receipt
  -> Order Closure
  -> Profitability Analysis
```

This rule is defined in `docs/architecture/gii-operational-chain-of-command-rule.md`.

## 29. Work Order / Supply Order Parent Entity Rule

For the current GII government supply lifecycle, Work Order / Supply Order is the parent operational entity.

Current implementation mapping:

- Business parent concept: `WORK_ORDER`
- Current code parent entity: `SUPPLY_ORDER`
- Current table: `supply_orders`
- Current line table: `order_items`
- Current primary route: `supply_orders`

Work Order / Supply Order is operational, not accounting.

Work Order / Supply Order must not post ledger entries by itself.

All downstream government supply modules must preserve traceability back to Work Order / Supply Order where applicable.

This rule is defined in `docs/architecture/work-order-parent-entity-rule.md`.

## 30. Workflow Governance Registry Rule

Every workflow-bearing ERP domain must define or comply with a workflow registry entry.

Each workflow must declare:

- workflow_id
- workflow_name
- business_domain
- parent_entity
- lifecycle_stages
- required_stage_order
- optional_stages
- allowed_skip_rules
- accounting_start_stage
- inventory_start_stage
- GST_start_stage
- closure_stage
- reporting_stage
- future_extension_notes

The current registered workflow is `GOVERNMENT_SUPPLY_LIFECYCLE`.

The registry must remain future-proof for Payroll, AMC / Service Contract, Project Work, Manufacturing, Asset Purchase, Legal Case Billing and Internal Expense lifecycles.

This rule is defined in `docs/architecture/workflow-governance-registry.md`.

---

## Version History

| Version | Date | Description |
| --- | --- | --- |
| v3.2 | 2026-07-09 | Added Enterprise Intelligence Layer Governance, Major Program Baseline Rule, Programme Stabilization and Certification Law, Operational Chain of Command, Work Order Parent Entity and Workflow Governance Registry rules. |
| v3.1 | 2026-06-25 | Added Feature Classification, Dependency Assessment and Production Readiness Gate governance rules. |
| v3.0 | 2026-06-25 | Integrated Product Governance, Git Governance, Verification Sequencing, Expanded Desktop Smoke Test and Governance Layer Hierarchy. |
| v2.1 | 2026-06-25 | Added Global UX Governance and the mandatory Phase Governance Pipeline. Renumbered final checklist. |
| v2.0 | 2026-06-21 | Expanded from 14 to 18 rules. Added Renderer Safety, Database/Data Safety, Navigation/UX Safety, Print/Export Safety, Error Guidance, Desktop Smoke Test, detailed Stop Rules, and Final Checklist. |
| v1.0 | Previous | Initial 14-rule permanent architecture anchor. |
