# PERMANENT ARCHITECTURE AND FUNCTIONAL SAFETY RULES FOR GII GeM ERP

Version: 3.1

## GI-EGS Compliance Reference

Apply GI-EGS (Gesture India Engineering Standards) standards.

Canonical GI-EGS repository:
https://github.com/advmayankmanvendra-glitch/GI-ENGINEERING-STANDARDS

Refer to the GI-EGS master governance rules for engineering standards, documentation discipline, audit procedure, architecture control, naming conventions, acronym expansion, Codex/OpenCode review process, and clearance protocol.

Do not redefine, duplicate, override, or maintain separate engineering standards inside this project. This project must only consume and comply with GI-EGS standards.

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

## 26. Major Program Baseline Rule v2

Every major architectural program must begin by establishing a named baseline.

### 26.1 Programs Covered

This rule applies to:

- **Renderer Program** — any phase group that structurally modifies the renderer (CSS segmentation, presentation extraction, route registry, navigation, App.jsx reduction, dead code removal)
- **Database Program** — DG-1 implementation or any schema-level database restructuring
- **Workflow Program** — WG-1 implementation or workflow engine changes
- **CRM Program** — any future CRM integration phase group
- **AI Program** — any future AI integration phase group
- **Mobile Program** — any future mobile platform phase group

### 26.2 Baseline Sequence

Before the first subphase of any major program begins, execute this exact sequence:

```
Step 1: Git Working Tree
        ↓
        Clean (git status — no uncommitted changes)

Step 2: Verification
        ↓
        PASS (npm run verify:erp or applicable suite)

Step 3: Named Git Tag
        ↓
        Program Baseline (e.g. renderer-baseline-2026-07-01)

Step 4: Remote Push
        ↓
        GitHub synchronized (git push --tags)

Step 5: External Backup
        ↓
        Offline copy (SQLite DB + full repo outside working directory)
```

All five steps must complete before any code change for the program begins.

### 26.3 Tag Naming Convention

All baseline tags follow this format:

```
<program>-baseline-<YYYY-MM-DD>
```

Standard program identifiers:

| Program   | Example Tag                          |
|-----------|--------------------------------------|
| Renderer  | `renderer-baseline-2026-07-01`       |
| Database  | `database-baseline-2026-08-15`       |
| Workflow  | `workflow-baseline-2026-09-25`       |
| CRM       | `crm-baseline-2026-09-01`            |
| AI        | `ai-baseline-2026-10-10`             |
| Mobile    | `mobile-baseline-2027-01-15`         |

Tags are always lowercase, hyphen-separated. The date is the actual baseline date (not the planning date).

### 26.4 Why

A named baseline ensures that:

- Every major program can be rolled back to its starting state if needed.
- Verification regressions can be compared against a known-good reference.
- Future auditors can identify exactly where a program began.
- The program's end state can be measured against its start.
- External backup protects against data loss during structural changes.
- Tag naming is predictable across all future programs.

### 26.5 Exception

Minor subphases within an already-baselined program (e.g., 17C.2 after 17C.1 is complete) do not require a new baseline. The original program baseline remains valid until the program concludes.

## 27. Programme Stabilization and Certification Law

Note: This rule was submitted as "Permanent Architecture Rule 25 - Programme Stabilization & Certification Law". It is stored here as Rule 27 to preserve existing Rule 25, Enterprise Intelligence Layer Governance, and Rule 26, Major Program Baseline Rule v2.

### 27.1 Principle

No major programme shall directly transition into another major programme.

Every programme must complete the following mandatory lifecycle:

```text
Implementation
        |
        v
Stabilization Programme
        |
        v
Certification Programme
        |
        v
Lock Report
        |
        v
Architecture Gate Decision
        |
        v
Next Programme
```

No step may be skipped.

### 27.2 Mandatory Sequence

Every major programme shall follow:

1. Programme Implementation
2. Programme Stabilization
3. Programme Certification
4. Programme Lock Report
5. Executive Architecture Gate Decision
6. Begin Next Programme

### 27.3 Stabilization Programme

Purpose:

- Remove implementation defects
- Correct inconsistencies
- Complete unfinished workflows
- Verify operational behaviour
- Resolve integration issues
- Complete desktop smoke testing
- Eliminate regression risks

No feature expansion shall occur during stabilization.

### 27.4 Certification Programme

Purpose:

Certify that the implemented programme satisfies:

- Accounting integrity
- Inventory integrity
- GST integrity
- Report integrity
- Dashboard integrity
- Document integrity
- Navigation integrity
- Security
- Performance
- Verification
- Production readiness

Certification is evidence-based.

Verification reports alone do not constitute certification.

### 27.5 Lock Report

A Lock Report shall record:

- Scope completed
- Verification results
- Certification status
- Known limitations
- Outstanding risks
- Safe-to-lock decision
- Next recommended programme

The Lock Report becomes the permanent historical reference for that programme.

### 27.6 Executive Architecture Gate

Before any new programme begins, an Executive Architecture Gate Audit shall determine:

- Safe to Proceed
- Proceed After Fixing Blockers
- Do Not Proceed

Only one decision shall be issued.

### 27.7 Deployment Cautions

Beginning a new programme without completing Stabilization, Certification and Lock shall be considered an architectural governance violation.

Potential consequences include:

1. Architecture Drift - unfinished work accumulates across multiple programmes, making ownership and responsibility unclear.
2. Hidden Regression - features appear to work individually but fail when interacting with other modules because integration was never stabilized.
3. Certification Debt - verification reports may pass while operational workflows remain uncertified, leading to false confidence.
4. Technical Debt Growth - large files, duplicated logic, inconsistent UI behaviour and undocumented dependencies accumulate rapidly.
5. Knowledge Repository Divergence - KG, ERP Brain, Help Assistant and documentation begin describing different system behaviour.
6. Dashboard Mismatch - dashboards may diverge from certified accounting reports if source certification is skipped.
7. Operational Inconsistency - Reset, Go-Live, Imports, Documents, Reports and Accounting may produce conflicting results because cross-programme stabilization never occurred.
8. Audit Weakness - government, GST, statutory or internal audits become more difficult because certification history is incomplete.
9. User Confidence Loss - users lose trust when recently completed features behave inconsistently despite successful builds.
10. AI Reliability Reduction - future ERP Brain and AI assistants depend upon certified system knowledge; uncertified modules reduce reasoning quality and may produce incorrect guidance.

### 27.8 Mandatory Stop Rule

If any of the following remain unresolved:

- Verification failure
- Production readiness failure
- Reset inconsistency
- Dashboard/source mismatch
- Accounting imbalance
- Database inconsistency
- Dirty architecture baseline
- Failed desktop certification
- Missing Lock Report

then:

No subsequent major programme shall begin.

Only stabilization, certification or corrective work is permitted.

### 27.9 Executive Principle

The ERP shall never measure progress by the number of implemented features.

Progress shall instead be measured by:

- Stabilized programmes
- Certified programmes
- Locked programmes
- Production-ready programmes

A completed programme is one that has been implemented, stabilized, certified and locked, not merely coded.

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

No module may bypass the approved lifecycle without a documented exception.

## 29. Work Order / Supply Order Parent Entity Rule

For the current GII government supply lifecycle, Work Order / Supply Order is the parent operational entity.

In current implementation terms:

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

## 31. Accounting Intelligence Repository (AIR) Governance

The Accounting Intelligence Repository (AIR) is the canonical accounting knowledge layer of GII GeM ERP.

AIR defines accounting concepts independently of any ERP software.

AIR shall derive accounting principles from authoritative accounting standards and regulations.

ERP systems such as:

- TallyPrime
- Tally ERP9
- SAP
- Oracle
- QuickBooks
- Zoho Books
- BUSY
- Marg

shall be treated as implementation references only, not as accounting authorities.

AIR shall contain:

- Universal accounting concepts
- Accounting relationships
- Accounting validation rules
- Financial reporting concepts
- Inventory accounting concepts
- GST and taxation concepts
- Internal control concepts
- Audit concepts
- ERP implementation mappings
- Migration intelligence
- AI reasoning metadata

Every AIR concept shall define:

- Definition
- Purpose
- Business meaning
- Accounting rules
- Validation rules
- Relationships
- Workflow impact
- Database mapping
- Report impact
- AI explanation
- Migration notes
- References

AIR shall integrate with:

- Enterprise Intelligence Layer
- ERP Brain
- Knowledge Graph
- Help Assistant
- Future Data Assistant

Future AI shall explain accounting concepts using AIR before consulting ERP-specific implementations.

---

## 32. Navigation & Location Queries Are Always Safe

The ERP Help Assistant must answer user questions about where to find ERP features, screens, menus, reports, documents, workflows, and record-entry areas.

Examples:
- Where is bill history?
- How do I open purchase bills?
- Which menu has GST reports?
- Where can I see opening balances?
- How do I create a supply order?

These are navigation/help lookups, not live record inspection. They must be resolved from the route/view registry, navigation map, screen titles, help metadata, and user-facing labels.

The assistant must not refuse these questions on the basis that it cannot inspect live records.

The assistant must not use internal governance language such as:
- H1-H5
- safe summary
- arbitrary live records
- route registry
- permission layer
- capability boundary

If the user asks to see actual records, totals, balances, pending bills, payments, customer-wise lists, or company-specific data, the assistant must explain the limitation in user language.

Bad:
"The H1-H5 assistant is only allowed to answer guidance questions."

Good:
"You can find Bill History under Operations → Purchase Bills. I can guide you to the screen, but I cannot show your specific bills from here yet."

The response should always provide the navigation answer first, then mention any live-data limitation only if relevant.

---

## Audit Log (AIR Rule 31)

| Date | Severity | Phase | Summary | File |
|------|----------|-------|---------|------|
| 2026-07-09 | MEDIUM | 6 (Database init.js Audit) | `init.js` is 9,277-line monolith — 40+ internal reports hidden, no section headers, no `//` comments. Safe to refactor only after `database-baseline` tag. | `reports/audit-database-init-architecture.md` |
| 2026-07-09 | LOW | 7A (Extract Report Builders) | Extracted 43 internal report builders from `init.js` into `reportBuilders.js`. init.js reduced from 8,763 → 7,978 lines (−785). Baseline `database-baseline-2026-07-09` created. Restore tag `init-refactor-phase-7a-restore-2026-07-09`. | `reports/init-refactor-phase-7a-report-builders-extraction-report.md` |
| 2026-07-10 | LOW | 7B (Extract CRUD Helpers) | Extracted generic CRUD operations (assertTable, cleanPayload, createRecord, updateRecord, deleteRecord, getRecord, listRecords, etc.) into `crudHelpers.js` via factory pattern. init.js reduced from 7,978 → 7,572 lines (−406). Restore tag `init-refactor-phase-7b-restore-2026-07-10`. | `reports/init-refactor-phase-7b-crud-helpers-extraction-report.md` |
