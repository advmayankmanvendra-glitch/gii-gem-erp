# Gesture India Infrastructure (GII) Government e-Marketplace (GeM) Enterprise Resource Planning (ERP) Pending Work and Safe Implementation Sequence

**System:** Gesture India Infrastructure (GII) Government e-Marketplace (GeM) Enterprise Resource Planning (ERP)

**Evidence date:** 21 August 2026

**Current result:** **BLOCKED for new major programmes**

**Reason:** authorization, financial classification, graph/governance consistency and evidence-continuity blockers remain.

**Graph identifier key:** BRAIN denotes ERP knowledge/assistant stages; Knowledge Graph (KG), Database Graph (DG), Workflow Graph (WG), Feature Function Graph (FF) and Audit Graph (AG) identify the other roadmap families.

## 1. Recommended course

Do not begin a new feature programme from the existing baseline. First approve and complete one corrective sequence:

1. Reconcile governance and graph records without changing runtime behaviour.
2. Harden session-bound authorization for destructive/release actions.
3. Complete FSR-2B.3 governed financial classification.
4. Stabilize, certify and lock the corrected baseline.
5. Reconcile the Supplier Purchase Order entity and stage hard workflow enforcement.
6. Begin BRAIN-3.5 / KG-5 runtime consumption as the next graph programme.

This order puts data and authorization safety ahead of convenience or intelligence features.

## 2. Immediate approval gate: audit reconciliation

### Objective

Obtain owner approval for the findings in this audit before any live registry, rule, permission or accounting change.

### Corrections after approval

- Resolve KG-5 Active versus Planned conflict.
- Update BRAIN-1 entry count from stale registry evidence after an approved fresh count.
- Repair 12 missing graph dependency reverse links.
- Reconcile RG-1 version 2.0 versus 2.0.0 and eight-versus-nine graph metadata.
- Remove stale FF-2 future-phase wording.
- Choose the canonical permanent-rule version and add/reconcile Accounting Intelligence Repository Rule 31.
- Preserve mandatory phase reports in a tracked path or allowlist them narrowly.
- Extend verification to block historical-status, dependency-reciprocity, count and evidence-path conflicts.

### Business effect

Future developers and Artificial Intelligence (AI) tools will discover the same current state instead of receiving contradictory roadmap instructions.

### Risk

Low runtime risk because this phase should be documentation, registry metadata and verification only. It still requires architecture approval because the live registry and permanent rules are controlled assets.

## 3. Recommended next implementation phase: Authorization Boundary Stabilization

### Objective

Make every high-impact desktop action prove the current authenticated session and the required permission before execution.

### Required scope

- Replace renderer-payload identity for sensitive writes with session-bound authorization.
- Guard environment profile/type changes.
- Guard go-live execute, verify, complete and rollback.
- Guard certificate generation.
- Guard reset execute, enhanced reset and rollback.
- Audit every allow and deny decision with actor identity.
- Remove administrative fallback when a valid session is absent.
- Preserve existing accounting, inventory, tax, database schema and user data.

### Out of scope

- No role redesign unless separately approved.
- No database deletion, reseeding or production reset.
- No accounting formula or posting changes.
- No new remote authentication provider.

### Verification gate

- Targeted permission tests for all guarded handlers and every role.
- Negative tests: no session, expired session, viewer, data-entry operator and cross-company context.
- Positive tests for authorized administrator/super-administrator actions using isolated data.
- Audit-log attribution checks.
- Syntax, build, accounting, financial, controls, flow, safe-delete and packaged desktop smoke tests.
- Independent final diff review for authorization bypass and data-loss risk.

### Business effect

Reduces the risk that a local renderer action can change environment, reset data or run go-live operations without proving the signed-in user's authority.

### Approval required

Yes. Authentication and permissions are protected architecture areas.

## 4. Second implementation phase: FSR-2B.3 Financial Classification Cutover

Financial System Reliability (FSR) verification currently has two known failures:

1. Group totals do not yet derive from a governed backend classification registry.
2. The renderer still groups accounts by name heuristics.

### Required scope

- Make backend/report builders use the effective-dated account mapping authority.
- Return governed group/classification fields with report rows.
- Remove renderer name-based grouping.
- Preserve historical/custom unmapped accounts as explicit review items; never guess.
- Provide backward compatibility and rollback for existing data and reports.

### Gate

`verify:financial-reports` must reach 25/25, and all accounting, financial-year, inventory, money, mapping and drill-down suites must remain passing. This is accounting-sensitive work and requires a fresh verified backup plus isolated restore before any production-data migration.

## 5. Third corrective phase: Company and lifecycle boundary repair

### Required work

- Scope Supply Order entity search to the selected company.
- Reject billing when the selected order and company do not match; remove first-company fallback.
- Resolve receipt allocation ambiguity where an order has multiple invoices.
- Make Order Closure prove settlement and outstanding-issue state.
- Add explicit audit evidence to Consignee Receipt and Acceptance Certificate mutations.
- Repair the unreachable Profit Simulator route or remove its menu entry under separate approval.

### Business effect

Prevents users from acting on the wrong company/order and makes closure/profitability evidence trustworthy.

## 6. Supplier Purchase Order reconciliation before hard workflow enforcement

The approved chain contains a Supplier Purchase Order stage, but current `procurements` records behave like supplier purchase invoices and can post Purchase accounting. No distinct `supplier_purchase_orders` or `purchase_order_items` runtime table exists.

The owner must approve one current business meaning before implementation:

- Create a true non-accounting supplier purchase commitment entity, followed later by supplier bill/purchase posting; or
- Formally rename and revise the governed chain if the current record is intended to be the purchase bill.

Recommended course: create a distinct Supplier Purchase Order entity because it preserves the approved operational sequence and prevents purchase commitment from being confused with accounting recognition.

This is a database and workflow programme. It requires a named baseline, backup, migration, rollback, compatibility test and explicit approval.

## 7. Hard workflow enforcement sequence

Only after Supplier Purchase Order semantics and company context are stable:

1. Connect the workflow engine to live routes/services in warning-only observation mode.
2. Implement reliable current-stage lookup.
3. Certify optional-stage skip rules.
4. Hard-block only high-confidence required transitions.
5. Add closure and profitability gates last.

WG-3B through WG-3F remain the named pending enforcement family. Hard-blocking all stages at once is not recommended because it could make existing records inaccessible.

## 8. Next graph programme

After the corrective baseline is stabilized and locked, the recommended next graph programme is:

**BRAIN-3.5 / KG-5 runtime consumption**

### Scope

- Load KG-5 as the governed document/manual discovery graph.
- Use its section and cross-graph references in Help Assistant/ERP Brain answers.
- Retain source citations and read-only boundaries.
- Do not give the assistant authority to post, approve, delete, restore, reset or inspect arbitrary live records.

### Gate

- KG-5 remains 30/30.
- ERP Brain, Help Assistant and relevance suites pass.
- Manual search results remain source-backed.
- No accounting, inventory, tax or permission change occurs.

## 9. Other genuine pending work

### Effective-pending graph families

- DG-1.1 to DG-1.4: column integrity, index analysis, trigger/view mapping and schema generation.
- KG-4: cash/bank reporting, inventory accounting/reversal, financial-year filters, settlement and later tax/currency capabilities.
- AG-2: live audit-row to event mapping and stronger attribution/lineage.
- WG-3B to WG-3F: staged runtime enforcement.
- FF-1 extension: service-contract coverage and audit-intent routing.

### Product capabilities

- GeM API integration — NOT STARTED; manual fallback exists.
- Payroll — NOT STARTED; employee master exists.
- Installation completion checklist — PASS WITH WARNINGS; record entry exists, mandatory completion control does not.
- Automatic supplier purchase-order generation — NOT STARTED.
- Automatic approval routing — NOT STARTED.
- Dedicated Cash/Bank Book backend builder — NOT STARTED.
- Opening-balance reversal — NOT STARTED; Journal correction is the current workaround.

### Deferred/unverified

- BRAIN-5 Large Language Model (LLM) programme — DEFERRED.
- RG-2 — UNVERIFIED and should not be implemented from the stray reference alone.
- Additional payroll, annual maintenance contract, manufacturing, asset, legal and internal-expense workflows — PLANNED concepts only.

## 10. Release sequence for every implementation phase

Each approved phase must follow:

1. Clean Git and data baseline.
2. Architecture and dependency audit.
3. User Experience and security/authorization review where applicable.
4. Named programme tag and external backup when required by the baseline rule.
5. Narrow implementation.
6. Targeted and full verification on isolated representative data.
7. Electron desktop smoke test.
8. Stabilization programme.
9. Certification programme.
10. Lock report and Executive Architecture Gate.
11. Separate approval for commit, tag, push, release and production deployment.

## 11. Stop conditions

Stop before the next programme if any of these remain:

- Unauthorized destructive/release path.
- Accounting/report verification failure.
- Company-context mismatch.
- Database migration or restore failure.
- Missing phase/stabilization/certification evidence.
- Dirty baseline.
- Workflow change that makes existing records inaccessible.
- Registry status contradiction.

This sequence is a recommendation only. No implementation, registry modification, commit, push or deployment was performed.
