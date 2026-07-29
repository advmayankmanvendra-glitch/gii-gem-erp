# FSR-2B.2 Controlled Account Assignment and UX Architecture Audit

**Programme:** Financial Statement Reporting (FSR) 2B  
**Phase:** FSR-2B.2 architecture audit and scope split  
**Audit date:** 2026-07-29  
**Mode:** Architecture, security, and dependency audit  
**Audit status:** PASS  
**Primary category:** Architecture  
**Secondary categories:** Accounting, Security, User Experience (UX), Import / Export, Governance  
**Product maturity stage:** Operational Control

## Executive Decision

**PASS - PROCEED TO FSR-2B.2A CONTROLLED ACCOUNT-GROUP ASSIGNMENT SERVICE.**

The FSR-2B.2 scope defined by FSR-2B.0 crosses several high-risk categories.
It shall therefore be delivered as three governed subphases:

1. **FSR-2B.2A - Controlled Assignment Service and Desktop API**
2. **FSR-2B.2B - Chart of Accounts and Quick Create UX**
3. **FSR-2B.2C - Staged Import and Search Consistency**

Only FSR-2B.2A is approved by this audit. FSR-2B.2B and FSR-2B.2C require the
FSR-2B.2A backend contract and verification to pass first.

## Objective

Establish the safest implementation boundary for controlled account-group
assignment without changing the accounting source of truth locked by FSR-2A.

The completed FSR-2B.1 foundation provides:

- governed account groups;
- financial-statement mappings;
- effective-dated account-group assignments;
- deterministic mappings for built-in accounts;
- explicit unmapped status for custom accounts;
- company-isolated classification and coverage reads;
- database triggers for company, type, normal-balance, and date compatibility.

FSR-2B.2 must add a controlled write path before any renderer, Quick Create,
import, search, or financial-report cutover is allowed.

## Baseline Evidence

| Evidence | Result |
|---|---|
| Current branch | `phase-16-enterprise-crm-integration` |
| FSR-2B baseline commit | `350eb13` |
| FSR-2B baseline tag | `fsr-2b-baseline-2026-07-29` |
| FSR-2B.1 implementation commit | `88fa2b6` |
| FSR-2B.1 verification | 41 of 41 checks passed |
| Database graph verification | 31 of 31 checks passed |
| FSR-2B.1 desktop smoke test | Passed |
| Custom accounts awaiting review | 11 |
| FSR-2A accounting truth | Certified and locked |

The FSR-2B.1 implementation commit is local and has not been pushed or tagged
by this phase.

## Current Architecture Findings

### Read Contract Is Present

`src/main/services/accountMappingService.js` provides company-scoped registry,
classification, and coverage reads. It does not write account assignments.

### Database Guards Are Present

`account_group_assignments` is effective-dated and stores:

- company;
- account;
- account group;
- effective dates;
- status;
- provenance;
- assigning user;
- change reason.

Database triggers reject:

- invalid ISO dates;
- account/company mismatch;
- account-type mismatch;
- normal-balance mismatch;
- overlapping active assignment periods.

The service must add user-facing validation before relying on these final
database guards.

### Generic Writes Must Remain Blocked

The `accounts` and mapping tables are accounting-sensitive. Generic Create,
Read, Update and Delete (CRUD) paths must not become a mapping bypass. A
dedicated assignment service is required.

### Existing Permission Guard Is Not Sufficient

The existing general Inter-Process Communication (IPC) guard obtains a user
identifier from renderer arguments. When no identifier is supplied, the
authorization service can fall back to the first active administrator.

That behavior must not be copied into the new account-mapping write path.
FSR-2B.2A must bind the write authorization to the user authenticated for the
calling Electron renderer window. A renderer-supplied user identifier must not
be authoritative.

The broader legacy IPC authorization pattern is outside FSR-2B.2A and shall be
recorded as a separate security-hardening risk. FSR-2B.2A must not silently
refactor every existing IPC action.

### Company Context Must Be Mandatory

The new write path must:

- require an explicit current company;
- verify that the account belongs to that company;
- reject an omitted or mismatched company;
- never fall back to the first company;
- include the company in audit evidence.

### Presentation and Report Cutover Are Later

The Chart of Accounts screen does not yet show governed mapping fields. Quick
Create, staging import, and ledger search do not yet carry mapping state.
Financial reports and renderer presentation are not to be changed in
FSR-2B.2A.

## Approved Subphase Boundaries

### FSR-2B.2A - Controlled Assignment Service and Desktop API

Approved scope:

- extend the dedicated account-mapping service with controlled assignment;
- require company, account, posting group, effective date, and change reason;
- use authenticated Electron-window session identity;
- add a dedicated `account_mapping` permission;
- allow only approved accounting roles;
- preserve assignment history through effective dates;
- reject invalid, ambiguous, or incompatible assignments;
- write complete audit evidence;
- add dedicated read and write IPC/preload methods;
- keep browser preview read-only;
- add populated executable verification;
- update Enterprise Intelligence Layer evidence where required.

Explicitly excluded:

- Chart of Accounts renderer changes;
- Quick Create changes;
- import template or import execution changes;
- entity-search changes;
- financial-report cutover;
- renderer heuristic removal;
- voucher, ledger, Goods and Services Tax (GST), inventory, or money changes.

### FSR-2B.2B - Chart of Accounts and Quick Create UX

Future scope:

- show mapping status and group in Chart of Accounts;
- provide a controlled assignment/review dialog;
- display unmapped and review-required status;
- integrate governed group selection into ledger Quick Create;
- complete keyboard, accessibility, help, error-guidance, and Electron testing.

This subphase may begin only after FSR-2B.2A passes and has a restore point.

### FSR-2B.2C - Staged Import and Search Consistency

Future scope:

- add mapping fields to staging-only import;
- keep unknown mappings in review-required state;
- require company-isolated ledger search;
- prevent direct live-table import;
- reconcile imported accounts to the same controlled assignment service.

This subphase may begin only after FSR-2B.2B passes and has a restore point.

## FSR-2B.2A Service Contract

The assignment command shall require:

| Field | Rule |
|---|---|
| `company_id` | Positive integer; must match the account company |
| `account_id` | Active, non-deleted account in the selected company |
| `account_group_id` | Active leaf group with `posting_allowed = 1` |
| `effective_from` | Strict `YYYY-MM-DD` date |
| `change_reason` | Required plain-language audit reason |
| authenticated user | Derived from the Electron session, not renderer payload |

Assignment behavior:

- an identical active mapping is an idempotent no-op;
- a changed future/current mapping closes the preceding open period and inserts
  a new assignment;
- a same-date correction updates that dated assignment with full audit evidence;
- overlapping or backward periods are rejected unless a future controlled
  historical-correction phase explicitly approves them;
- account type and normal balance must match the selected group;
- assignment must not update an account, voucher, voucher line, ledger entry,
  report amount, inventory row, or GST row.

Unassignment is excluded from FSR-2B.2A because it can deliberately remove
financial-statement classification and requires its own governance decision.

## Permission Decision

Introduce a dedicated `account_mapping` backend permission.

Allowed roles:

- Super Administrator;
- Administrator;
- Accountant.

Denied roles:

- Manager;
- Data Entry Operator;
- Viewer;
- anonymous or expired desktop session.

Generic `edit` permission is not sufficient because it is granted to
non-accounting roles.

## UX Compliance Assessment

FSR-2B.2A adds no visible mapping editor and does not redesign any screen.
Global UX Governance therefore applies only to:

- plain-language validation errors;
- error messages that identify the account, company, or mapping field;
- no mutation capability in browser preview.

Full form, keyboard, help, table, modal, and accessibility compliance belongs to
FSR-2B.2B.

## Enterprise Intelligence Layer Assessment

The database graph already records the FSR-2B.1 registry tables, service, and
verification evidence. FSR-2B.2A shall:

- preserve graph schema compatibility;
- update only affected service/verification evidence if required;
- run the active graph audit packs;
- reference the Enterprise Intelligence Layer in the phase report.

No new graph type or graph schema is approved.

## Verification Requirements

FSR-2B.2A must prove:

- explicit authenticated session is required;
- renderer payload cannot impersonate another user;
- permission matrix is enforced;
- company is mandatory and isolated;
- only active compatible posting groups can be assigned;
- effective dates and reasons are required;
- identical assignment is idempotent;
- assignment history is preserved;
- audit records include old and new mapping evidence;
- generic CRUD remains blocked;
- browser preview cannot mutate mappings;
- vouchers, ledgers, reports, GST, inventory, and minor-unit totals are unchanged.

Required regression:

```text
npm.cmd run lint:syntax
npm.cmd run build
npm.cmd run verify:fsr2b1
npm.cmd run verify:database-graph
npm.cmd run verify:audit
npm.cmd run verify:erp
npm.cmd run verify:accounting
npm.cmd run verify:financials
npm.cmd run verify:controls
npm.cmd run verify:voucher-inventory
npm.cmd run verify:flow
npm.cmd run verify:phase10
```

The dedicated FSR-2B.2A verifier shall be added to this baseline.

Because IPC, preload, authentication session state, and runtime behavior are
affected, an Electron desktop smoke test is mandatory.

## Risks and Controls

| Risk | Severity | Control |
|---|---|---|
| Renderer impersonates a privileged user | HIGH | Bind mapping authorization to Electron-window login session |
| Wrong-company account is mapped | HIGH | Mandatory company plus account/company check |
| Incompatible account classification | HIGH | Service validation plus database triggers |
| Historical reports change unexpectedly | HIGH | Controlled effective dates; report cutover remains excluded |
| Generic APIs bypass mapping governance | HIGH | Dedicated service; protected tables remain blocked |
| Mapping writes alter accounting truth | CRITICAL | Invariant verification over vouchers, ledgers, reports, GST, and inventory |
| Wider legacy guard weakness expands scope | MEDIUM | Record separately; harden only the new mapping path here |

## Dependencies

| Dependency | Status |
|---|---|
| FSR-2A accounting-truth lock | Satisfied |
| FSR-2B programme baseline and external backup | Satisfied |
| FSR-2B.0 architecture audit | Satisfied |
| FSR-2B.1 registry, migration, read service, and verifier | Satisfied |
| Current company context | Available; mandatory validation required |
| Authentication and role registry | Available; session binding required |
| Audit log service | Available |
| Global UX Governance | Reviewed; full application deferred to FSR-2B.2B |
| Enterprise Intelligence Layer graph registry | Available |

**Dependencies Satisfied: Yes**

## Architecture Compliance

| Rule | Result |
|---|---|
| Audit before implementation | PASS |
| App.jsx protection | PASS - no business logic approved there |
| Reuse before create | PASS - extend the existing mapping/auth/audit services |
| Preserve locked accounting logic | PASS |
| Company-context safety | PASS with mandatory service enforcement |
| No silent refactor | PASS |
| Versioned database migration | Not required for FSR-2B.2A |
| Programme split for high-risk categories | PASS |

## Final Gate

**FSR-2B.2 ARCHITECTURE AUDIT PASS - FSR-2B.2A MAY BEGIN.**

This decision does not authorize FSR-2B.2B, FSR-2B.2C, financial-report cutover,
renderer heuristic removal, release packaging, production deployment, commit,
push, or tag.

FSR-R18 remains OPEN.  
FSR-R19 remains OPEN.  
RMD-1 remains BLOCKED.  
Production packaging and release remain BLOCKED.
