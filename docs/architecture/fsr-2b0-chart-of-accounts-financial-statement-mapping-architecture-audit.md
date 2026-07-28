# FSR-2B.0 Chart of Accounts and Financial-Statement Mapping Architecture Audit

**Programme:** Financial Statement Reporting (FSR) 2B
**Phase:** FSR-2B.0
**Audit date:** 2026-07-29
**Mode:** Architecture audit only
**Implementation status:** NOT STARTED
**Audit status:** PASS
**Primary category:** Architecture
**Secondary categories:** Accounting, Reporting, Governance
**Product maturity stage:** Operational Control

## Executive Decision

**FSR-2B.0 ARCHITECTURE AUDIT PASS — PROCEED TO FSR-2B.1 REGISTRY CONTRACT AND MIGRATION FOUNDATION.**

This decision approves the architecture direction only. It does not approve a
database migration, report cutover, renderer change, commit, release, or
production deployment.

FSR-2B must introduce governed Chart of Accounts classification and
financial-statement mapping without changing the accounting truth certified and
locked by FSR-2A.

## Objective

Determine how GII GeM ERP (Government e-Marketplace Enterprise Resource
Planning) should replace account-name and renderer heuristics with a governed,
auditable classification and financial-statement mapping architecture.

The audit covers:

- the current `accounts` structure;
- account creation, import, search, and protection paths;
- Trial Balance, Profit and Loss, and Balance Sheet report inputs;
- renderer-side account grouping;
- Financial Statement Reporting verification failures;
- migration and company-isolation requirements;
- Enterprise Intelligence Layer graph impact;
- the safe implementation and certification sequence.

## Governing Baseline

The FSR-2A accounting-truth lock is effective.

Verified baseline:

| Evidence | Result |
|---|---|
| Current branch | `phase-16-enterprise-crm-integration` |
| Current commit | `47a4e86` |
| Remote branch | Points to `47a4e86` |
| Annotated restore tag | `fsr-2a-accounting-truth-lock-2026-07-24` |
| Local peeled tag target | `47a4e86` |
| Remote peeled tag target | `47a4e86` |
| Working tree at audit start | Clean |

The following restrictions remain in force:

- FSR-R18 remains OPEN.
- FSR-R19 remains OPEN.
- Release and Migration Dependency (RMD) 1 remains BLOCKED.
- Production packaging and release remain BLOCKED.
- FSR-2B must not alter the locked accounting source-of-truth contract.
- Renderer grouping remains presentation-only until governed backend mapping is
  implemented and certified.

## Locked Accounting Contract

FSR-2B may classify and present accounting data. It must not change the data
that constitutes accounting truth.

The following FSR-2A controls remain authoritative:

- INTEGER minor-unit money columns;
- balanced voucher posting;
- voucher-line and ledger-entry equality;
- company and financial-year isolation;
- draft and cancelled voucher exclusion;
- signed balance and contra-account treatment;
- opening-balance and carry-forward controls;
- inventory subledger and General Ledger (GL) reconciliation;
- Goods Received Not Invoiced (GRNI) clearing;
- single Cost of Goods Sold (COGS) recognition;
- party control-account reconciliation;
- Trial Balance, Profit and Loss, and Balance Sheet amount equality;
- voucher and ledger drill-down;
- compatibility disagreement detection.

FSR-2B mapping may determine where an amount is presented. It must never change
the amount, posting account, voucher state, ledger row, inventory valuation, or
tax calculation.

## Current Evidence

### Financial-Structure Verification

`npm.cmd run verify:financial-reports` produced:

```text
23 passed, 2 failed, 25 total
```

The only failures are:

| Check | Current failure | FSR-2B responsibility |
|---|---|---|
| 9 | No governed account-group/report-mapping registry | Yes |
| 16 | Renderer assigns financial classifications heuristically | Yes |

Check 20 passes against the authoritative minor-unit contract. Checks 9 and 16
must be corrected without weakening or rewriting the other 23 checks.

### Current Account Model

The `accounts` table currently provides:

- company;
- account name and code;
- one of five broad account types: Asset, Liability, Equity, Income, Expense;
- optional parent account;
- opening balance compatibility value;
- normal Debit or Credit balance;
- status and soft-delete fields.

It does not provide:

- a governed account-group identifier;
- a stable group code;
- financial-statement section or subsection;
- current/non-current classification;
- report display order;
- mapping version or effective date;
- mapping status or provenance;
- system-account protection metadata;
- statutory or cash-flow mapping.

`parent_account_id` is a ledger hierarchy field. It is not currently used by
the report builders and must not be repurposed as the account-group registry.

### Current Financial Reports

The report builders use broad `account_type` filters:

- Profit and Loss uses Income and Expense;
- Balance Sheet uses Asset, Liability, and Equity;
- Trial Balance includes all eligible accounts.

The report builders calculate amounts from authoritative ledger minor-unit
values. They do not currently return a governed account group, statement
section, subsection, current/non-current class, or mapping status.

Some summaries also depend on exact account names such as `Sales`, `Purchase`,
`Input GST`, and `Output GST`. These posting and summary dependencies are
outside the first FSR-2B mapping slice. Replacing them requires a separately
audited system-account-role programme because an uncontrolled replacement could
change certified accounting behavior.

### Current Renderer Classification

`src/renderer/features/reports/accountingIntelligence.jsx` currently contains:

- `classifyAccountGroup(row)`;
- account-name keyword matching;
- broad account-type fallback rules;
- `enrichAccountingRows(rows)`, which supplies `structure_group`.

The heuristic can classify similar account names differently and can present a
confident group without governed backend evidence. It is the direct cause of
Check 16.

The renderer must eventually consume an authoritative mapping returned by the
backend. It must not remain an independent classification authority.

### Current Account Entry Paths

Account classification is absent from:

- Chart of Accounts display configuration;
- Quick Create ledger form;
- browser-preview ledger fallback;
- account import templates;
- Tally staging-to-ledger assignment;
- account search results;
- controlled account-creation Application Programming Interface (API).

The `accounts` entity is accounting-protected. Generic Create, Read, Update and
Delete (CRUD) writes are blocked. A future mapping write path therefore requires
a dedicated accounting service, guarded Inter-Process Communication (IPC),
preload exposure, role checks, company checks, validation, and audit logging.

### Default and Custom Accounts

Built-in accounts have stable account codes and can receive deterministic seed
mappings.

User-created and imported accounts cannot safely be classified from their names.
Unknown accounts must enter an explicit `UNMAPPED` or `REVIEW_REQUIRED` state.
They must not receive a guessed high-confidence financial classification.

## Architecture Findings

### Finding 1 — A Registry Is Required

The five broad account types are not sufficient for governed financial
statements. A normalized account-group registry is required for stable grouping,
hierarchy, posting policy, presentation order, and auditability.

### Finding 2 — Mapping Must Be Separate From Posting

Account grouping and financial-statement presentation are related but distinct:

- an account group describes the accounting nature of an account;
- a statement mapping describes where that group appears in a reporting profile.

Keeping these contracts separate prevents statement presentation from becoming
a hidden posting rule.

### Finding 3 — One Source of Classification Truth Is Required

Classification must be resolved in the main-process accounting/reporting layer
and returned as structured data. Renderer name matching must not be a fallback
classification engine.

### Finding 4 — Migration Cannot Guess Custom Ledgers

Automatic name-based backfill would create false certainty. Built-in accounts
may be mapped by stable codes. Custom, imported, renamed, or ambiguous accounts
must be listed for controlled review.

### Finding 5 — Report Totals Must Remain Invariant

FSR-2B may reorganize report rows and headings. Before and after migration:

- total Debit must remain equal to total Credit;
- Profit and Loss total amounts must remain unchanged;
- Balance Sheet total amounts must remain unchanged;
- group totals must reconcile exactly to ledger totals in minor units;
- mapping changes must not write to vouchers or ledgers.

## Recommended Architecture

### 1. Account-Group Registry

Create a normalized `account_groups` contract with fields equivalent to:

| Field | Purpose |
|---|---|
| Stable group code | Durable identifier independent of display name |
| Group name | User-facing accounting group |
| Parent group | Controlled hierarchy |
| Compatible account type | Prevent Asset-to-Income and similar invalid assignment |
| Normal balance | Validation and presentation support |
| Contra behavior | Explicit presentation behavior where applicable |
| Posting allowed | Distinguish ledger-posting groups from headings |
| System protected | Prevent unsafe rename/deactivation |
| Display order | Stable account hierarchy |
| Active status | Controlled retirement |
| Version/effective metadata | Audit and future migration support |

The final physical column names require an approved implementation contract in
FSR-2B.1.

### 2. Financial-Statement Mapping Registry

Create a normalized `financial_statement_mappings` contract with fields
equivalent to:

| Field | Purpose |
|---|---|
| Reporting profile | Supports future statutory or management profiles |
| Account group | Governed classification source |
| Statement | Balance Sheet or Profit and Loss presentation |
| Section and subsection | Structured report position |
| Current/non-current class | Balance Sheet presentation |
| Presentation/sign rule | Display behavior only; not posting math |
| Display order | Stable statement layout |
| Effective date/version | Controlled reporting changes |
| Active status | Historical continuity |

Trial Balance grouping may consume the account-group hierarchy directly. It
must not require a duplicate amount engine.

### 3. Account Assignment

Add a governed account-to-group assignment, preferably through
`accounts.account_group_id` or a versioned assignment table if historical
effective dating is required.

The implementation must record:

- assigned group;
- mapping status;
- mapping provenance;
- effective version where applicable;
- who changed it and when through the audit log.

Do not duplicate statement section data on every account merely to satisfy the
present Check 9 source test. Check 9 should be promoted to executable registry,
coverage, and reconciliation evidence. If a flattened shape is needed for
consumption, use a derived query or view with one canonical authority.

### 4. Backend Classification Service

Add a controlled service that resolves:

- account group code and name;
- hierarchy;
- financial statement and section;
- current/non-current class;
- display order;
- mapping status and provenance.

The reporting service must return these fields with report rows. It must continue
to obtain monetary values from the locked FSR-2A source-of-truth path.

### 5. Renderer Consumption

After backend mapping is populated and reconciled:

- report screens consume returned classification fields;
- `classifyAccountGroup` is removed as an authority;
- an unmapped row displays `Unmapped — review required`;
- no account-name heuristic supplies a financial classification;
- report totals and drill-down remain unchanged.

### 6. Controlled Mapping Administration

A future mapping editor must use:

- a dedicated service;
- guarded IPC and preload methods;
- current-company enforcement;
- role and permission checks;
- compatibility validation;
- change reason;
- audit-log evidence;
- safe treatment of system-protected groups.

Generic CRUD must remain blocked for accounting-sensitive records.

## Company and Version Policy

Recommended initial policy:

- canonical system group definitions are shared and versioned;
- each company assigns its accounts to those governed groups;
- every report query filters by the current company;
- no silent fallback to the first company is allowed;
- company-specific reporting overrides require a later, separately approved
  reporting-profile extension.

The decision between a direct account foreign key and a versioned assignment
table must be finalized in FSR-2B.1 after testing historical reporting
requirements. Historical report reproducibility should take priority over a
smaller schema.

## Migration and Backfill Rules

The next implementation phase must use the next available versioned migration.
The migration number must be rechecked immediately before implementation;
`034_fsr2a5b_money_shadow_columns` is the latest observed migration in this
audit.

Required migration behavior:

1. Create the registry without removing or rewriting existing accounting data.
2. Seed canonical groups and statement mappings idempotently.
3. Map built-in accounts by stable account code or controlled system identity.
4. Leave ambiguous and custom accounts explicitly unmapped.
5. Produce mapped, unmapped, invalid, and conflicting account counts.
6. Validate account type and normal balance compatibility.
7. Reconcile group totals to ledger totals in INTEGER minor units.
8. Prove that vouchers, ledger entries, openings, carry-forward, stock values,
   tax values, and report totals are unchanged.
9. Test upgrade and rollback on a copied fixture before any operational
   database is migrated.
10. Preserve compatibility with the previous application version until the
    migration and rollback plan is certified.

No production or user database migration is authorized by this audit.

## Verification Contract for FSR-2B

Checks 9 and 16 must become executable evidence.

### Check 9

Pass only when:

- the governed group and statement-mapping registry exists;
- every active, report-eligible account is mapped or explicitly marked for
  review;
- group totals reconcile exactly to account and ledger totals;
- invalid type/group assignments are rejected;
- company isolation is proven;
- no renderer classification is needed to produce group totals.

### Check 16

Pass only when:

- report rows carry backend-governed classification fields;
- renderer reports do not classify by account name;
- unknown classification is shown as unmapped rather than guessed;
- the same backend mapping is used consistently across Trial Balance, Profit
  and Loss, and Balance Sheet.

### Required Regression

Each implementation subphase must run the applicable focused verifier plus:

```text
npm.cmd run lint:syntax
npm.cmd run build
npm.cmd run verify:financial-reports
npm.cmd run verify:accounting
npm.cmd run verify:financials
npm.cmd run verify:controls
npm.cmd run verify:voucher-inventory
npm.cmd run verify:flow
npm.cmd run verify:phase10
npm.cmd run verify:erp
```

Database and accounting verifiers must run sequentially.

The final FSR-2B target is:

```text
25 passed, 0 failed, 25 total
```

This numerical target is not sufficient by itself. Populated reconciliation,
migration evidence, Electron desktop smoke testing, certification, lock report,
and Executive Architecture Gate approval are also mandatory.

## Enterprise Intelligence Layer Impact

The graph registry was loaded before source analysis.

Relevant active graphs:

| Graph | Current relevance | Expected implementation action |
|---|---|---|
| Database Graph (DG-1) | Current `accounts` schema and protection | Update for new tables, fields, relations, migrations, and protected writes |
| Voucher Accounting Graph (KG-4) | Report dependencies on accounts and ledger entries | Update if report dependency shapes change |
| Renderer Graph (RG-1) | Records `classifyAccountGroup` and enrichment | Update when heuristic classification is removed |
| Feature-Function Graph (FF-1) | Maps user functions to implementation | Update if mapping administration or report functions change |

Graph schema versions and the graph registry must be updated only as required by
the Enterprise Intelligence Layer compatibility rules. All affected graph audit
packs must pass after each implementation phase.

Current graph verification evidence:

- Database Graph: 27/27 PASS;
- Voucher Accounting Graph: PASS;
- combined graph audit: 204 PASS, 4 informational items, 0 warnings, 0 failures,
  0 critical findings.

The observed date-time validator messages are non-fatal informational output.

## Dependencies

**Dependencies Satisfied: Yes — for the architecture audit.**

Implementation dependencies:

| Dependency | Status |
|---|---|
| FSR-2A accounting truth certified and locked | Satisfied |
| Annotated restore tag pushed to the lock commit | Satisfied |
| Current financial report verifier baseline measured | Satisfied |
| Account schema and report paths audited | Satisfied |
| Renderer heuristic identified | Satisfied |
| Relevant Enterprise Intelligence Layer graphs identified | Satisfied |
| Final registry field contract | Required in FSR-2B.1 |
| Historical effective-dating decision | Required in FSR-2B.1 |
| Migration dry-run and rollback evidence | Required before database use |
| Controlled mapping service and permission design | Required before mapping writes |
| Desktop mapping/report smoke test | Required before certification |

## Risk Assessment

| Severity | Risk | Required control |
|---|---|---|
| HIGH | Custom accounts are wrongly auto-mapped | Stable-code mapping only; ambiguous accounts remain unmapped |
| HIGH | Classification changes report totals | Exact before/after minor-unit parity and drill-down checks |
| HIGH | A second source of truth is created | One normalized backend mapping authority |
| HIGH | Mapping changes posting behavior | Keep posting and system-account resolution outside initial cutover |
| MEDIUM | Cross-company mapping leakage | Mandatory company filter and company-isolation fixtures |
| MEDIUM | Quick Create, import, and browser fallback diverge | Update all entry paths in one controlled subphase |
| MEDIUM | Historical reports change after remapping | Resolve effective dating before schema approval |
| MEDIUM | Renderer or graph metadata becomes stale | Remove heuristic only after backend cutover; update graph packs |
| MEDIUM | Generic APIs bypass accounting protections | Dedicated service, permissions, validation, and audit log |

## Proposed Programme Sequence

### FSR-2B.1 — Registry Contract and Migration Foundation

- approve the normalized data contract;
- decide historical effective dating;
- create versioned schema and canonical seeds;
- add read-only mapping resolution;
- run migration dry-run, rollback, and populated reconciliation;
- do not cut reports or renderer over yet.

### FSR-2B.2 — Controlled Account Assignment and Chart of Accounts User Experience (UX)

- add dedicated controlled mapping service;
- add guarded IPC and preload methods;
- add company, permission, validation, and audit controls;
- update Chart of Accounts, Quick Create, import, and search paths;
- expose unmapped/review-required status.

### FSR-2B.3 — Report Cutover and Renderer Heuristic Removal

- return governed mapping fields from report services;
- cut Trial Balance, Profit and Loss, and Balance Sheet presentation to the
  registry;
- remove renderer name-based classification;
- prove exact report amount and drill-down parity;
- promote Checks 9 and 16 to populated executable verification.

### FSR-2B.4 — Stabilization, Certification, Lock and Gate

- stabilize mapping, migration, report, and user workflows;
- complete populated and Electron certification;
- achieve 25/25 financial-report structure checks;
- produce lock report and restore point;
- complete Executive Architecture Gate before FSR-2C.

No FSR-2C implementation may begin before FSR-2B.4 is certified and locked.

## Stop Rules

Stop FSR-2B implementation immediately if:

- any FSR-2A verifier regresses;
- voucher, ledger, opening, carry-forward, inventory, tax, or report amounts
  change;
- a migration guesses ambiguous custom-account mappings;
- company isolation fails;
- report drill-down changes or becomes incomplete;
- renderer heuristics remain an undisclosed classification authority;
- an accounting-protected write is exposed through generic CRUD;
- rollback cannot restore the previous compatible state;
- an affected Enterprise Intelligence Layer graph fails validation;
- desktop reports open blank or produce runtime errors.

## Scope and Impact

| Area | FSR-2B.0 result |
|---|---|
| Files changed | This audit document only |
| Components changed | None |
| Services changed | None |
| Reports changed | None |
| IPC/preload impact | None in this audit; dedicated guarded methods expected in FSR-2B.2 |
| Route/view key impact | None expected |
| Database impact | None in this audit; versioned additive migration expected in FSR-2B.1 |
| Accounting logic impact | None permitted |
| Goods and Services Tax (GST) impact | None permitted |
| Inventory valuation impact | None permitted |
| Report Structured Query Language (SQL) arithmetic impact | None permitted |
| Desktop smoke test | Not applicable to documentation-only audit |

## Production Readiness

**Classification:** NOT STARTED
**Production readiness gate:** BLOCKED pending implementation, stabilization,
certification, lock report, restore point, and Executive Architecture Gate.
**Safe to lock:** No — this is an architecture audit, not an implemented
programme lock.

## Recommended Next Action

Begin **FSR-2B.1 — Registry Contract and Migration Foundation** as a separately
authorized implementation phase.

Before editing source code, FSR-2B.1 must:

1. recheck Git status and the FSR-2A restore tag;
2. recheck the latest migration identifier;
3. approve the registry fields and historical effective-dating model;
4. define populated migration, rollback, company-isolation, and total-parity
   fixtures;
5. create a phase-specific restore point in accordance with programme
   governance;
6. preserve the complete FSR-2A accounting truth contract.
