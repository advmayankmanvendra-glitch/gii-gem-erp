# BRAIN-4 Read-Only ERP Assistant Planning Report

## 1. Executive Summary

BRAIN-4 is a planning-only phase for a future **Read-Only ERP Assistant**. It will use the locked Enterprise Intelligence Layer v1.0.0 as its sole knowledge baseline: KG-1, WG-1, DG-1, KG-4, BRAIN-2, BRAIN-3, RG-1, and manuals.

No chatbot UI, LLM, external API, live-record access, action-taking behavior, database access, posting, reversal, approval, import/export, or runtime ERP change is included in this plan.

## 2. Planning Scope

This plan defines future boundaries, query policy, response contract, presentation, verification, risks, and implementation sequencing. It does not authorize implementation. The assistant is an explainable, graph-aware, source-backed read-only guide, not a general chatbot or operational automation agent.

## 3. Dependency Baseline

| Locked dependency | Planned use |
|---|---|
| KG-1 | Module, feature, navigation, risk, and help metadata |
| WG-1 / KG-2 | Government supply workflow, stage dependencies, skip rules, and operational boundaries |
| DG-1 | Static table, relationship, report-source, and protection explanation |
| KG-4 | Static voucher, posting-pattern, reversal-rule, and accounting explanation |
| RG-1 | Screen, route, component, and renderer explanation |
| BRAIN-2 | Read-only source search, answer contract, source references, confidence, known gaps |
| BRAIN-3 | Existing contextual Help Assistant integration and accounting safety presentation |
| Manuals | User-operation, training, troubleshooting, month-end, import, and migration guidance |

The future assistant must load `repository/graph-registry.json` first and then load only the required graph/source set for a query.

## 4. Source Baseline Reviewed

Reviewed: graph registry; workflow, database, voucher/accounting, renderer, and KG registries; ERP Brain loaders/search/answer builders; Help Assistant modules; rollup/stabilization/BRAIN-3 lock reports; and manual sources.

Baseline verification at planning time: build PASS; KG/WG/DG/KG-4 PASS; BRAIN-2 51/51 PASS; BRAIN-3 23/23 PASS; audit 183 PASS, 2 INFO, 0 WARN/FAIL/CRITICAL; ERP/accounting/financial/control/inventory/flow/phase10 PASS.

## 5. Assistant Definition

**Read-Only ERP Assistant**:

- Source-backed: every substantive answer links to graph, repository, or manual evidence.
- Explainable: response exposes confidence, review state, sources, relations, known gaps, and prohibited actions.
- Graph-aware: uses WG-1, DG-1, KG-4, RG-1, and KG-1 according to query type.
- Accounting-safe: explains accounting but cannot create, post, reverse, approve, or alter a voucher.
- Role-aware in presentation only: adapts depth, never permissions.
- Manually verifiable: users can open cited screen/manual/report themselves.

It is not an unrestricted chatbot, LLM gateway, live database inspector, posting assistant, approval assistant, automation bot, or command executor.

## 6. Permitted Capability Matrix

| Capability | Allowed behavior | Primary source | Required response element |
|---|---|---|---|
| Workflow explanation | Explain stage, predecessor, successor, skip rule | WG-1 | Workflow stages and safety boundary |
| Screen guidance | Explain purpose and navigation | RG-1 + KG-1 + BRAIN-3 | Related screen/source |
| Manual/help reference | Cite relevant manual/checklist section | Manuals | Manual reference |
| Database table explanation | Explain static table/relationship/protection | DG-1 | Related tables; no live query |
| Voucher/accounting explanation | Explain voucher pattern and impact | KG-4 | Accounting safety note |
| Report source explanation | Explain static report dependency | DG-1 + KG-4 | Related reports/tables |
| Known gap explanation | State documented limitations | Graph `knownGaps` + reports | Needs-review state |
| Troubleshooting guidance | Explain documented causes and safe checks | BRAIN errors + manuals | Manual/screen fallback |
| Module navigation guidance | Direct user to current route/screen | KG-1 + RG-1 | Screen reference |
| Training mode guidance | Explain training/checklist steps | Manuals + Help content | Training reference |
| Month-end checklist guidance | Explain checklist sequence | Month-end manual + KG-4/DG-1 | Accounting warning |
| Import/export explanation | Explain controlled process only | Manuals + KG-1 | Prohibited action notice |
| Tally migration explanation | Explain staging/validation process | Manuals + BRAIN repository | Prohibited action notice |
| Static interpretation | Interpret static graph/manual metadata | Locked EIL sources | Source references |

## 7. Prohibited Capability Matrix

| Prohibited capability | Reason | Required handling |
|---|---|---|
| Live database record reading | Privacy, context, integrity, permission risk | Explain static data model and direct user to screen |
| Live financial analysis | Requires authorized current data and accounting controls | Refer to formal report screen |
| Voucher posting/reversal | Accounting mutation | Refuse; explain controlled ERP screen/process |
| Approval | Permission and governance mutation | Refuse; explain approval queue/process |
| Ledger/stock editing | Financial and inventory mutation | Refuse; direct to controlled module |
| Delete/restore | Data integrity mutation | Refuse; explain recovery policy |
| Import/export execution | File/data mutation risk | Explain validation/staging only |
| Email/notification sending | External side effect | Not available |
| Shell command execution | Host security risk | Not available |
| External LLM/API call | Data governance and dependency risk | Not available |
| Automatic accounting correction | Audit and ledger integrity risk | Not available |

## 8. Query Classification Policy

| Category | Preferred source | Fallback | Answer style | Safety note | Confidence | Needs review |
|---|---|---|---|---|---|---|
| Workflow question | WG-1 | Manuals, KG-1 | Stage/dependency explanation | Yes when financial stage | Yes | If partial/planned/gap |
| Screen/help question | RG-1 | KG-1, BRAIN-3, manuals | Navigation and screen purpose | No unless sensitive | Yes | If route/reference absent |
| Manual/training question | Manuals | KG-1 | Steps/checklist | No unless sensitive | Yes | If no matching section |
| Database/table question | DG-1 | KG-1 | Static table/relationship explanation | Yes | Yes | If table/gap absent |
| Voucher/accounting question | KG-4 | DG-1, manuals | Pattern/impact explanation | Always | Yes | For low confidence/gap |
| Report question | DG-1 + KG-4 | KG-1/RG-1 | Report dependency explanation | Yes for financial report | Yes | If report source incomplete |
| GST/tax question | KG-4 + manuals | DG-1 | ERP-process explanation only | Always | Yes | Always for filing/compliance decision |
| Inventory question | WG-1 + DG-1 | KG-1/manuals | Stock-flow explanation | Yes | Yes | If valuation/actual stock requested |
| Troubleshooting question | BRAIN errors + manuals | KG-1 | Safe diagnostic steps | Contextual | Yes | If no documented cause |
| Known gap question | Graph `knownGaps` | Architecture reports | Explicit limitation | Yes | Yes | Always |
| Unsafe action request | None | None | Clear refusal plus safe navigation | Always | N/A | N/A |
| Unknown/needs review | Manuals/KG-1 | Related help topic | State uncertainty; show sources | Contextual | Always | Always |

### Preferred Source Rules

- Workflow: WG-1.
- Database/table: DG-1.
- Voucher/accounting: KG-4.
- Screen/route/component: RG-1.
- General feature knowledge: KG-1/BRAIN repository.
- User operation: manuals.
- Troubleshooting: troubleshooting manual plus BRAIN errors repository.
- Known gaps: graph `knownGaps` plus architecture reports.

## 9. Safety Boundary Policy

| Domain | Assistant may do | Assistant must not do |
|---|---|---|
| Accounting | Explain patterns, controlled functions, reports, and safety rules | Post, reverse, approve, or alter vouchers/ledger |
| Database | Explain static schema, relationships, source tables | Query live records or mutate schema/data |
| Inventory | Explain inward/outward/reservation/COGS flow | Create stock movement or adjustment |
| GST/tax | Explain report sources and ERP process | Certify compliance, file returns, or calculate statutory obligation outside ERP evidence |
| Workflow | Explain dependencies, stage order, skip rules | Bypass governance or alter workflow status |
| Import/export | Explain staging, validation, and controlled process | Trigger import/export or alter files/data |

Every accounting-sensitive response must state that the assistant is guidance-only and must identify the controlled module/report for user verification.

## 10. Response Contract

```js
{
  answer: "string | null",
  confidence: "high | medium | low",
  needsReview: false,
  sourceReferences: [{ title, sourceKind, sourcePath, graphId, summary }],
  relatedWorkflowStages: ["WORK_ORDER"],
  relatedScreens: ["supply_orders"],
  relatedTables: ["supply_orders"],
  relatedVoucherTypes: ["sales"],
  relatedReports: ["trialBalance"],
  safetyBoundary: "read-only guidance",
  knownGaps: [{ title, summary, sourceKind }],
  suggestedNextHelpTopic: "string | null",
  prohibitedActions: ["post", "reverse", "approve", "delete", "restore", "import", "export"]
}
```

Contract rules:

- At least one source reference is required for any substantive answer.
- Low confidence requires `needsReview=true` and a manual/report/screen verification suggestion.
- Accounting-sensitive results require a safety boundary and prohibited actions.
- The contract contains no live record values and no executable command/action payload.

## 11. UI Planning Recommendation

Recommended first UI: extend the existing Help Assistant with an **Ask ERP Brain** read-only mode.

- Existing Help Assistant panel and input field.
- Source-backed answer card with confidence and needs-review state.
- Source references, related workflow/screen/table/report/manual topics.
- Safety boundary notice for accounting, inventory, GST, import/export, and workflow-sensitive questions.
- Related-topic navigation only.

Future conceptual views: screen-specific assistant cards, workflow trace assistant, report explanation assistant, and training-mode assistant.

Explicitly prohibited controls: Post this voucher, Reverse this voucher, Approve this record, Import this file, Fix database, Run command, or any mutation action button.

## 12. Role-Aware Presentation Plan

| Role | Presentation adaptation | Boundary |
|---|---|---|
| Admin | Source/graph diagnostics and known gaps | No permission grant or mutation |
| Accountant | Voucher pattern, reports, and accounting warning depth | No posting/reversal |
| Operator | Workflow steps, screen fields, next safe screen | No workflow bypass |
| Approver | Approval policy explanation and source evidence | No approval action |
| Auditor | Source, audit-trail, protection, and report dependency explanation | No live audit-log query |
| Read-only user | Plain navigation/help explanation | No privilege escalation |

Role changes explanation depth only; it never changes access control or invokes a permission API.

## 13. Verification Strategy

Future implementation should add `scripts/verify-read-only-erp-assistant-plan.js`. It must verify:

1. Planning report and lock note exist.
2. No LLM/API dependency is added.
3. No write, posting, mutation, IPC-write, or preload-write import exists.
4. All query categories and preferred-source rules are defined.
5. Response contract includes sources, confidence, review state, safety, and prohibited actions.
6. Unsafe requests return refusal/guidance only.
7. Accounting-sensitive questions require safety notice.
8. Manual/help fallback is present.
9. BRAIN-2 and BRAIN-3 runtime checks remain backward compatible.
10. No UI action button maps to a mutation.

This planning phase does not create the script or implementation.

## 14. Risk Register

| Risk | Severity | Mitigation | Source of truth | Verification |
|---|---|---|---|---|
| Hallucinated ERP process | High | Source-required answer contract | WG-1/KG-1/manuals | Source reference test |
| Wrong voucher/accounting answer | Critical | KG-4-first, accounting safety, needs review | KG-4/DG-1 | Preferred-source and boundary tests |
| Outdated manual reference | Medium | Manual index validation and source path | Manuals/manualIndex | Manual path test |
| Stale graph reference | Medium | Graph source/route freshness checks | WG-1/RG-1/KG-1 | Reference existence test |
| Guidance treated as posting authority | High | Prominent prohibited actions and wording | BRAIN safety policy | Unsafe request test |
| Work Order/Supply Order confusion | High | Canonical terminology mapping | WG-1/DG-1/KG-4 | Work Order synonym test |
| Draft versus posted confusion | High | State/report warning language | KG-4/manuals | Accounting answer test |
| Live-record assistant introduced | Critical | No DB/IPC read capability in scope | Architecture boundary | Import/capability scan |
| LLM without governance | Critical | No SDK/API/network dependency | Architecture boundary | Dependency scan |
| Role/permission bypass | Critical | Presentation-only role plan | Security/controls | Permission boundary test |
| Tax/compliance overstatement | High | Explain ERP sources; require professional verification | KG-4/manuals | GST safety test |
| Action-taking feature creep | Critical | No action payload/buttons; phase gate | Product governance | UI/action scan |

## 15. Future Roadmap

| Phase | Scope | Boundary |
|---|---|---|
| BRAIN-4A | Read-Only ERP Assistant Design Specification | Documentation/design only |
| BRAIN-4B | Local read-only query classifier prototype | No LLM, no live records |
| BRAIN-4C | Response contract implementation | Source-backed static data only |
| BRAIN-4D | Existing Help Assistant UI extension | No action buttons |
| BRAIN-4E | Read-only assistant verification | Safety and regression evidence |
| BRAIN-4F | Internal user testing | Guidance-only UAT |
| BRAIN-5 | LLM gateway feasibility study | Study only, no implementation |

Action-taking assistance is deferred indefinitely until governance, permissions, audit evidence, rollback, approval, and accounting controls are separately designed and approved.

## 16. Deferred Items

- Chatbot implementation
- External LLM/API/model gateway
- Live-record inspection
- Financial analysis from current data
- Any posting/reversal/approval/edit/delete/restore/import/export action
- Email/command execution
- Permission or role mutation

## 17. Safe-to-Proceed Recommendation

**Safe to proceed to BRAIN-4A planning/design only.** A future read-only prototype must preserve this document’s source, safety, response, and verification contract. No chatbot, LLM, live-record, or action-taking implementation is authorized by this plan.
