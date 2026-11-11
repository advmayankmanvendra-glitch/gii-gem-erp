# FSR-2B.2B Chart of Accounts and Quick Create UX Architecture Audit

**Programme:** Financial Statement Reporting (FSR) 2B  
**Phase:** FSR-2B.2B  
**Audit date:** 2026-07-29  
**Mode:** Architecture, User Experience (UX), security, and dependency audit  
**Audit status:** PASS  
**Primary category:** UX  
**Secondary categories:** Accounting, Architecture, Security, Governance  
**Product maturity stage:** Operational Control

## Executive Decision

**PASS - PROCEED WITH THE CONTROLLED FSR-2B.2B USER INTERFACE.**

FSR-2B.2A has passed its authenticated Electron desktop cycle and is preserved
at commit `eb46122`. FSR-2B.2B may expose that locked service through the Chart
of Accounts and ledger Quick Create workflows.

The phase must not change the FSR-2A accounting source-of-truth contract,
financial-report Structured Query Language (SQL), route keys, account-mapping
schema, voucher posting, Goods and Services Tax (GST), or inventory valuation.

## Objective

Make governed financial-statement classification understandable and usable:

- show each ledger account's mapping status, account group, and statement;
- let approved accounting users assign or correct a mapping;
- require new Quick Create ledger accounts to receive a valid mapping in the
  same database transaction;
- keep all other roles and browser preview read-only;
- preserve effective-dated mapping history and audit evidence.

## Dependency Assessment

| Dependency | Result |
|---|---|
| FSR-2A accounting-truth lock | Satisfied |
| FSR-2B programme baseline | Satisfied |
| FSR-2B.1 mapping registry | Satisfied |
| FSR-2B.2A controlled assignment service | Satisfied |
| FSR-2B.2A authenticated Electron smoke test | Satisfied |
| FSR-2B.2A restore commit | `eb46122` |
| Company context | Satisfied; selected company remains mandatory |
| Global UX Governance | Reviewed and applicable |
| Enterprise Intelligence Layer | Active; affected renderer evidence must be regenerated |

**Dependencies Satisfied: Yes**

## Current Architecture Findings

### Chart of Accounts

`src/renderer/features/accounting/AccountingScreen.jsx` currently renders Chart
of Accounts through the generic accounting table. The table shows code, name,
type, normal balance, opening balance, and ledger drilldown. It does not load
or display governed account-group assignments.

A dedicated presentation component is required so mapping data and controlled
editing do not enlarge the generic accounting screen or `App.jsx`.

### Quick Create

`src/renderer/components/overlays/QuickCreateMasterDialog.jsx` creates ledger
accounts with name, code, type, and normal balance only. The desktop channel
`accounts:create-quick` still uses the older generic create guard and can leave
a newly created account unmapped.

The corrected path must:

1. require a compatible posting account group;
2. require an effective date and plain-language reason;
3. derive the authenticated user from the Electron window session;
4. create the account and assignment inside one database transaction;
5. roll back both records and audit entries if mapping fails.

### Permissions

The dedicated backend permission is `account_mapping`.

Allowed:

- Super Administrator;
- Administrator;
- Accountant.

Denied:

- Manager;
- Data Entry Operator;
- Viewer;
- anonymous or logged-out sessions.

The renderer must mirror this rule for discoverability, but backend enforcement
remains authoritative.

## Approved Implementation Boundary

### Main Process and Services

- Extend `accountMappingService.js` with atomic mapped-ledger creation.
- Reuse the existing `createLedgerAccount` service inside an outer transaction.
- Route `accounts:create-quick` through the session-bound `account_mapping`
  permission.
- Preserve the existing channel and preload method names.
- Add no migration and no new table.

### Renderer

- Add a modular `AccountMappingReviewPanel` under
  `src/renderer/features/accounting/accountMappings`.
- Render it only for `chart_accounts`.
- Show coverage, filters, mapping status, group, statement, ledger drilldown,
  and a controlled assignment dialog.
- Keep the existing generic Chart of Accounts table for roles that are not
  permitted to use account mapping.
- Extend ledger Quick Create with account group, effective date, and reason.
- Load only governed active posting groups that have a financial-statement
  mapping and match account type and normal balance.
- Keep all options in universal alphabetical order through the existing option
  sorting utility.

### Explicitly Excluded

- database migration or schema change;
- account unassignment;
- import-template or import-execution changes;
- entity-search changes;
- report-builder cutover;
- renderer heuristic removal;
- voucher, ledger-entry, GST, inventory, or money changes;
- new route/view keys;
- browser-preview mutation;
- FSR-2B.2C or FSR-2B.3 work.

## UX Compliance

| Requirement | Decision |
|---|---|
| Clear command labels | Use Assign Mapping / Change Mapping |
| Familiar action icon | Use the existing edit icon with tooltip |
| Keyboard save | `Ctrl+S` submits dialogs |
| Escape | Closes only after unsaved-change confirmation |
| Required fields | Group, effective date, and reason are mandatory |
| Error guidance | Identify the account or mapping field and next action |
| Alphabetical options | Use governed option sorting |
| Current company | Visible account data remains company-scoped |
| Empty state | Explain when no ledger mappings match filters |
| Table stability | Fixed columns and scrollable table wrapper |
| Accessibility | Dialog roles, labels, focusable controls, button tooltips |
| Responsive behavior | Summary and form grids collapse at narrow widths |
| Browser preview | No account or mapping mutation |

## Enterprise Intelligence Layer Assessment

The phase changes renderer ownership and the desktop account-mapping command.
After implementation:

- regenerate the renderer graph;
- update affected database-graph service evidence only where necessary;
- keep graph schemas backward compatible;
- run all active audit packs.

No new graph, graph schema, route, or database entity is approved.

## Verification Requirements

The focused verifier must prove:

- the Chart of Accounts panel uses the dedicated mapping APIs;
- only approved roles receive the mapping interface and Quick Create access;
- compatible account-group options are filtered and alphabetized;
- effective date and reason are mandatory;
- mapped ledger creation is atomic;
- failed mapping leaves no account or audit residue;
- the authenticated session supplies the actor;
- browser preview blocks Quick Create mutation;
- existing account mapping remains company-isolated and effective-dated;
- accounting and report amounts remain unchanged;
- no route, schema, report SQL, voucher, GST, inventory, or minor-unit logic
  changed.

Required regression:

```text
npm.cmd run lint:syntax
npm.cmd run build
npm.cmd run verify:fsr2b2b
npm.cmd run verify:fsr2b2a
npm.cmd run verify:fsr2b1
npm.cmd run verify:database-graph
npm.cmd run verify:audit
npm.cmd run verify:erp
```

The phase also requires an Electron desktop click-through of:

- Chart of Accounts mapped, unmapped, and filtered rows;
- assignment dialog validation and successful save;
- ledger Quick Create group selection and successful atomic creation;
- company context, ledger drilldown, back/navigation, and runtime console.

## Architecture Compliance Decision

| Rule | Result |
|---|---|
| `App.jsx` protection | PASS; no business logic planned |
| Modular placement | PASS |
| Reuse before create | PASS; existing service, dialog, forms, and API reused |
| Core accounting preservation | PASS |
| Company context safety | PASS |
| Dedicated permission | PASS |
| No silent refactor | PASS |
| No schema/report cutover | PASS |

**Implementation approved: Yes**

**Safe to begin FSR-2B.2B: Yes**

