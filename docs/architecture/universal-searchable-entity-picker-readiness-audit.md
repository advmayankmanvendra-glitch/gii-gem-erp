# Universal Searchable Entity Picker Readiness Audit

Date: 2026-07-18  
Mode: Architecture audit only  
Decision: BLOCKED - stabilize and lock the current mixed worktree before implementation

## Objective

Assess whether GII GeM ERP is ready to introduce a reusable, context-aware entity picker with keyboard navigation, bounded search results and integration with the existing Quick Create flow.

## Feature Classification

- Primary category: UX
- Secondary categories: Architecture, Operations, Accounting, Inventory, Security, Performance
- Product maturity stage: User Productivity with controlled operational data access
- Multi-category impact: Yes. The picker itself is presentation infrastructure, but its filters and Quick Create bridge touch company context, permissions, workflow eligibility, accounting-sensitive ledgers and inventory-sensitive references.

## Dependency Assessment

Dependencies Satisfied: No

Satisfied dependencies:

- Existing reusable `SearchableSelect` presentation control.
- Existing in-renderer `QuickCreateMasterDialog`.
- Existing save-and-select callback pattern.
- Existing Quick Create duplicate detection.
- Existing renderer-level create-role check.
- Existing backend permission guard for create operations.
- Existing current-company context on transaction screens.
- Existing WG-1 graph and advisory WG-3A workflow-stage engine.

Unsatisfied dependencies:

- Clean and certified architecture baseline for a new renderer/data-access programme.
- Stabilization and lock of the current WG-3A and Help UX worktree.
- Resolution and verification of the uncommitted master-delete safety change in `src/main/main.js`.
- A dedicated bounded entity-lookup service and reviewed IPC/preload contract.
- Entity-specific read permissions. Current backend permissions are action-oriented and do not provide separate `supplier.read`, `item.read` or `ledger.read` permissions.
- Certified workflow-eligibility predicates for Supply Order selection in Stock Inward. WG-3A is advisory/warn-only.
- A verified mapping for Work Order versus the current `supply_orders` implementation.
- A real Item Category master. Category is currently text stored on `items`, not a separate governed entity.
- A clean `git diff --check` baseline.

## Current Working Tree

The branch is `phase-16-enterprise-crm-integration` at release-candidate commit `82b2a19` and tag `gii-gem-erp-v1.0.0-rc1-2026-07-17`.

The post-RC worktree is dirty and mixes:

- WG-2/WG-3A workflow governance and verification.
- Help quick-action relocation.
- Master, billing and supply-order form changes.
- `App.jsx`, layout CSS and keyboard-adjacent UX changes.
- Packaging configuration changes.
- A material master-record deletion behavior change.

`git diff --check` currently fails because of trailing whitespace in `src/renderer/App.jsx` and `src/renderer/styles/layout.css`.

## Existing Selector Inventory

Repository scan result:

- Native `<select>` occurrences: 56
- `SearchableSelect` occurrences: 17
- Renderer files containing either selector type: 26

High-value migration candidates include:

- `src/renderer/features/transactions/TransactionScreen.jsx`
- `src/renderer/features/accounting/businessVouchers/BusinessVoucherScreen.jsx`
- `src/renderer/features/accounting/VoucherEntryScreen.jsx`
- `src/renderer/features/billing/BillingVoucherScreen.jsx`
- `src/renderer/features/operations/supplyOrders/SupplyOrderItemsGrid.jsx`
- `src/renderer/screens/CRAC/CRACEntryScreen.jsx`
- `src/renderer/screens/CRAC/OrderClosureScreen.jsx`

Stock Inward currently uses native selectors for Supply Order, Supplier, Item and Warehouse through `TransactionField`. These are the correct first migration candidates after the baseline is stabilized.

## Existing Search Behavior

`SearchableSelect` already provides:

- In-field text filtering.
- A bounded client-side list of 30 matches.
- Primary text and optional secondary note.
- Pointer selection and clear behavior.
- Focus-scoped F10 Quick Create handling.

Current gaps:

- No active-row keyboard model.
- No Arrow Up/Down, Enter, Page Up/Page Down, Home or End selection.
- No formal combobox/listbox ARIA contract.
- No Alt+Down or Alt+Insert handling.
- No result ranking beyond alphabetical sort and substring filtering.
- No remote bounded lookup or stale-request protection.
- No entity registry.
- No explicit workflow filter or read-permission guard.
- No no-match create action with prefilled search text.

## Existing Quick Create

`QuickCreateMasterDialog` is an in-renderer modal and must be reused. It currently supports:

- Item
- Supplier
- Government Department
- Institution / Consignee
- Expense Head
- Bank Account
- Warehouse
- Employee
- Ledger Account

It already provides required-field validation, duplicate detection, Use Existing, create-role checking, backend create calls and a callback that allows the parent screen to select the saved record.

Current limitations:

- The primary button says `Save`, not `Save and Select`.
- There is no general Quick Create registry exported for other controls.
- Company context is guaranteed only for types whose payload explicitly includes it.
- Generic master creation is not yet split into entity-specific create permissions.
- Nested Quick Create is not implemented.
- It does not use a portal or formal focus trap, although it stays within the existing renderer window.

## Current Data Access

The renderer currently receives large reference arrays from `referenceData` for employees, departments, suppliers, items, warehouses, expense heads, banks and supply orders. Stock Inward therefore loads complete active reference sets before presenting its native selectors.

The generic `records:list` path supports search, status and company filters, but it:

- Returns an unbounded list.
- Searches every configured field using a broad string match.
- Does not provide entity-specific ranking.
- Does not return `totalMatches` or `hasMore`.
- Is not an appropriate final contract for a universal picker.

No dedicated lookup IPC/preload API exists.

## Database and Index Assessment

No entity-picker-specific indexes were found for the proposed supplier, item, ledger and supply-order search columns.

Index work would be a database change and must not be bundled into the renderer foundation without a database impact review. Phase 1 should first measure indexed versus unindexed lookup behavior on representative data. FTS5 is not justified at this stage.

## Company and Workflow Safety

Required filtering by entity:

| Entity | Required scope |
| --- | --- |
| Supplier | Active records; future branch/access scope where available |
| Customer / Department | Active records; correct company/branch policy when implemented |
| Item | Active inventory-enabled records where required |
| Warehouse | Active company only |
| Ledger | Active company only; permitted account groups for the field |
| Supply Order | Active company, workflow-eligible status, selected supplier where present, pending quantity, not cancelled/closed |
| Work Order | Must follow the approved `WORK_ORDER` business concept while preserving the current `SUPPLY_ORDER` implementation mapping |
| Item Category | Distinct item category value only until a governed category master exists |

WG-3A currently provides advisory decisions only. It is not sufficient evidence for hard Supply Order eligibility blocking.

## Material Blocker: Delete Safety

The uncommitted `records:delete` handler in `src/main/main.js` skips `assertDeleteSafe` whenever the target is a master table. This is unrelated to entity selection and changes data-safety behavior for every master.

Although the CRUD helper contains referenced-master deactivation behavior, the dedicated delete-safety bypass has not been independently certified as equivalent or intentional. A universal Quick Create programme would increase master creation volume, making deletion and duplicate cleanup safety more important, not less.

This change must be separately audited, verified with `verify:safe-delete`, documented and either approved or corrected before entity-picker implementation.

## Recommended Architecture

After stabilization, add a reusable module under:

```text
src/renderer/components/entityPicker/
  SmartEntityPicker.jsx
  EntityPickerResultList.jsx
  EntityPickerEmptyState.jsx
  entityPickerRegistry.js
  useEntitySearch.js
  useEntityPickerKeyboard.js
  index.js
```

Keep database lookup logic in a main-process service and expose one bounded, read-only API through the established preload bridge. Do not place registry dictionaries, ranking logic or search engines in `App.jsx`.

The initial registry may describe eight entity types, but only four representative fields should be migrated in the first implementation phase:

1. Supplier in Stock Inward.
2. Item in Stock Inward.
3. Supply Order in Stock Inward.
4. Ledger in one manual voucher screen.

Warehouse should remain a fifth low-risk candidate if the first four pass. Work Order and Item Category should remain registered as constrained or deferred types until their current data-model mappings are explicitly approved.

## Keyboard Recommendation

- Alt+Down: open the focused picker.
- Arrow Up/Down: move active result.
- Enter: select active result.
- Esc: close without changing the field.
- Home/End and Page Up/Page Down: move through results.
- Alt+Insert: invoke Quick Create only for an eligible focused field.
- F10: retain temporarily as a legacy Quick Create alias and document its deprecation path.

These handlers must remain renderer-local. Do not use Electron `globalShortcut`.

## Phased Rollout

### Phase EP-0 - Stabilization prerequisite

- Separate or commit the current WG-3A, Help UX, form and packaging changes by governed scope.
- Resolve the master-delete safety change.
- Fix `git diff --check` failures and document encoding issues.
- Run required verification and Electron smoke tests.
- Create a clean named renderer baseline and external backup if this is treated as a major renderer programme.

### Phase EP-1A - Presentation foundation

- Build the registry and accessible in-memory picker using existing reference arrays.
- Add keyboard navigation and focus restoration.
- Preserve F10 while adding Alt+Insert.
- Integrate Supplier and Item on Stock Inward.
- No IPC or database changes.

### Phase EP-1B - Bounded lookup service

- Add one read-only lookup service and secure bridge method.
- Add bounded result contracts, ranking and stale-response protection.
- Add company and status filters.
- Integrate Supply Order and Ledger only after predicate review.

### Phase EP-1C - Quick Create bridge

- Export a governed Quick Create registry.
- Add no-match create actions and prefilled names.
- Add entity-specific create eligibility.
- Verify save-and-select and parent-form preservation.

### Phase EP-2 - Controlled migration

- Migrate additional screens in small groups.
- Do not replace all 56 native selectors in one phase.
- Certify accounting, inventory and workflow-sensitive groups separately.

## Verification Required Before Lock

- `npm.cmd run lint:syntax`
- `npm.cmd run build`
- Dedicated entity-picker verifier
- `npm.cmd run verify:workflow-enforcement`
- `npm.cmd run verify:safe-delete`
- `npm.cmd run verify:accounting`
- `npm.cmd run verify:financials`
- `npm.cmd run verify:controls`
- `npm.cmd run verify:voucher-inventory`
- `npm.cmd run verify:flow`
- `npm.cmd run verify:phase10`
- Electron visual and keyboard smoke test on Stock Inward and the selected ledger screen

## Architecture Impact

- App.jsx impact: None expected beyond existing screen composition; no picker engine belongs there.
- Route/view key impact: None.
- Database schema impact: None for EP-1A; indexes require separate approval in EP-1B or a database subphase.
- IPC/preload impact: None for EP-1A; one new read-only bounded lookup method proposed for EP-1B.
- Accounting logic impact: None permitted.
- Inventory valuation impact: None permitted.
- Voucher posting impact: None permitted.
- Workflow impact: Selection filtering only; no workflow stage mutation.
- Enterprise Intelligence Layer: WG-1 and DG-1 mappings must be consulted; graph structure need not change for EP-1A.

## Final Gate Decision

BLOCKED - fix and certify the current mixed OpenCode worktree before beginning the Universal Searchable Entity Picker implementation.

The proposal is architecturally sound and should become a common ERP control. The current repository state is not a safe baseline for adding a new renderer, IPC and workflow-sensitive programme.

