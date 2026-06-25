# GII GeM ERP Global UX Governance Standard

Status: Active standard  
Scope: New or changed UX work only  
Owner: GII GeM ERP architecture discipline  
Last updated: 2026-06-25

## Purpose

This document defines the standing UX and interaction rules for GII GeM ERP. It is meant to prevent inconsistent navigation, unclear actions, static drilldowns, confusing errors, and accidental changes to accounting or inventory data.

The goal is not to retrofit every existing screen at once. The goal is to ensure every future phase follows the same predictable desktop ERP behavior.

## Non-Negotiable Safety Rules

Do not change the following unless a phase explicitly requires it and the report documents the reason:
- accounting formulas
- voucher posting math
- GST calculations
- inventory valuation
- profitability formulas
- database schema
- IPC channel names
- preload API names
- route/view keys
- posting, approval, reversal, backup or restore workflows

Help, guidance, AI assistance and UX shortcuts must not silently create, edit, delete, post, reverse, approve, restore, import or correct data.

## App.jsx Protection

`src/renderer/App.jsx` should remain a layout shell, navigation shell, route orchestrator and established global state coordinator.

Do not add major new UX engines or dictionaries into `App.jsx`.

Use these locations instead:
- reusable UX utilities: `src/renderer/utils`
- reusable UI: `src/renderer/components`
- screen metadata and static UX config: `src/renderer/config`
- feature-specific UX: `src/renderer/features/<module>` or `src/renderer/screens/<module>`
- documentation: `docs/architecture` or `src/docs` when runtime loaded

## Navigation Standards

### Navigation History Service

All screen-level navigation should use one centralized navigation/history mechanism.

Required behavior:
- Direct screen navigation pushes the previous view into history.
- Drilldown navigation pushes the source view, filters and record context where practical.
- Back follows last-in-first-out order.
- Back from a drilldown should restore the originating screen and filter context where practical.
- Modal open/close is not screen navigation and must not pollute screen history.
- Esc closes overlays first before screen exit logic.
- Alt+Left triggers universal screen back.
- A visible Back button appears when useful screen history exists.
- Individual screens should not invent separate back logic unless documented as a necessary exception.

### Scroll and Focus

Every view navigation should reset the main ERP workspace scroll to a predictable position.

Same-page actions should scroll and focus the relevant section when a section is opened, expanded or selected.

Recommended helper behavior:
- find the target section
- scroll it into view
- focus the first safe interactive control only when it helps the user continue work
- do not steal focus from active typing unless the action was user-triggered

## Toolbar Standards

### List, Register and Report Screens

Recommended order:
1. Search
2. Filters
3. Date or period controls
4. View mode controls
5. Refresh
6. Export
7. Print
8. Help

### Entry and Form Screens

Recommended order:
1. Save Draft
2. Save and Submit
3. Approve or Post actions
4. Reverse or Cancel actions
5. Print or Preview
6. Attachments
7. Help

Critical actions must be visually separated and confirmation-protected:
- delete
- post
- approve
- reverse
- restore backup
- close financial year
- import confirm
- stock adjustment

## Keyboard Standards

Required global keyboard behavior:
- Enter moves to the next editable field in forms.
- Shift+Enter moves to the previous editable field.
- Enter inside a multiline text area inserts a newline unless the screen explicitly treats it as submit.
- Esc closes modals, dropdowns and suggestions before screen exit.
- Alt+Left triggers universal screen back.
- Ctrl+S saves only where a save action is available and safe.
- Ctrl+P opens the ERP print/preview path where available.
- Ctrl+K opens global ERP search.
- F1 opens context-aware screen help.

Keyboard shortcuts must never bypass confirmations, approvals, posting validations or locked-record controls.

## Search Standards

### Global ERP Search

Global ERP Search is opened with Ctrl+K. It should search across modules, records, reports and help entries where data is available.

It must be read-only unless a selected result explicitly opens a screen.

### Local Screen Search

Local search filters the current list, grid or report only.

Screens must not mix global and local search behavior without labels that make the difference clear.

## Processing Feedback Standards

Any action likely to take more than 300ms should show processing feedback.

Examples:
- saving
- posting
- import validation
- backup
- restore
- export
- print generation
- report refresh
- AI/help answer generation

Buttons should use disabled state while processing when duplicate clicks would be unsafe.

Success messages must not imply completion beyond the actual completed step. Example: validation success must not say import is ready unless all import gates pass.

## Empty Screen Standards

Never show only "No data" or a blank card.

Every empty state should include:
- why this screen is empty
- whether the empty state is normal, filtered, blocked or incomplete
- a safe next action
- a real call-to-action when applicable
- related screen guidance when helpful

Example: "No uploaded documents for this company. Upload documents from the relevant Add Record screen or open Missing Documents to review required files."

## Table and Grid Standards

Use the current table style for existing screens unless a phase specifically migrates that screen.

Phased target:
- adopt reusable table components for low-risk read-only screens first
- avoid converting billing, posting, import, inventory posting or voucher workflows without a dedicated phase
- keep row actions visible and readable
- do not hide correction or drilldown actions behind unclear icons
- long grids should support predictable scroll, filters, print and export

## Help Assistant Standards

The Help button must be screen-specific by default. Global Ask ERP Help remains separately available.

### Help Mode

Help Mode is knowledge driven. It answers questions such as:
- How do I create a credit note?
- How do I import stock?
- Why is import locked?

It should use manual, FAQ, workflow, troubleshooting and shortcut content.

### Screen Guidance

Screen Guidance is current-screen driven. It should explain:
- current screen purpose
- current module
- required fields
- visible warnings and missing fields where available
- accounting, GST or inventory impact
- recommended next action
- related screens
- related reports
- relevant shortcuts

Help Mode and Screen Guidance must feel clearly different.

### Question Input

The help question box should be suitable for real ERP questions:
- multiline input
- 4 to 5 visible rows by default
- max height around 10 rows
- resizable when practical
- Enter submits only when this behavior is clearly expected
- Shift+Enter adds a newline
- Submit button gives visible processing or sent feedback
- asked question remains visible above the answer
- answer shows source/context where practical
- related questions appear after the answer

## AI and Intelligence Standards

AI or intelligence layers may:
- explain
- guide
- recommend
- alert
- summarize
- predict
- highlight risk
- prepare a draft suggestion

AI or intelligence layers must not silently:
- post vouchers
- delete records
- reverse transactions
- approve transactions
- restore backups
- change GST
- change stock
- change ledger balances
- correct accounting data
- import live records

AI output should indicate:
- whether it is guidance-only
- whether it used live data
- source or screen context where practical
- confidence or uncertainty where practical

## Undo and Recovery Standards

Risky actions must use confirmation and recovery-first thinking.

Required behavior:
- posted transactions are corrected through reversal or controlled correction workflow
- destructive actions must have confirmation
- backup restore must require confirmation
- import confirm must be gated by validation
- audit logs must capture sensitive actions
- recovery instructions must be clear in ERP Health Center and related screens

## Responsive and Desktop Standards

GII GeM ERP is desktop-first.

Minimum comfortable width target: 1180px.

On smaller screens:
- preserve data entry usability
- collapse secondary panels where required
- do not hide critical status or posting controls without an obvious way to restore them
- avoid layouts that require both horizontal and vertical scrolling for normal entry

## Migration Strategy

Do not retrofit all screens in one large UX phase.

Recommended order:
1. Centralize navigation history and scroll/focus behavior.
2. Standardize empty states and error guidance on high-friction screens.
3. Standardize toolbars on read-only reports.
4. Improve Help Assistant and screen-specific guidance.
5. Adopt reusable table/grid components on low-risk read-only screens.
6. Add section anchors/tabs to long operational screens.
7. Move complex entry workflows only through dedicated phases.

## UX Compliance Checklist

Use this checklist in UX phase reports.

| Area | Required Check | Status |
| --- | --- | --- |
| App.jsx protection | No major UX or business logic added to App.jsx | Required |
| Navigation | Uses centralized navigation/back behavior | Required |
| Scroll/focus | New screens and same-page actions land predictably | Required |
| Toolbar | Action order follows ERP standard | Required |
| Keyboard | Shortcuts do not bypass safety controls | Required |
| Search | Global and local search are clearly separated | Required |
| Feedback | Actions over 300ms show processing state | Required |
| Empty states | Empty screens explain reason and next action | Required |
| Tables | Row actions and drilldowns are clear | Required |
| Help | Help defaults to current screen guidance | Required |
| AI safety | AI remains guidance-only unless explicitly approved workflow exists | Required |
| Recovery | Risky actions have confirmation and auditability | Required |
| Verification | lint, build, accounting and financial checks run | Required |
| Report | Known limitations are documented | Required |

## Known Current Limitations

This standard does not certify that every existing screen already complies.

Existing screens should be improved incrementally through scoped phases. Any exception should be stated in the relevant phase report.
