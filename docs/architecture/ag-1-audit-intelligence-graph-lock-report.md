# AG-1 Audit Intelligence Graph — Lock Report

**Programme:** AG-1 Audit Intelligence Graph
**Lock Date:** 2026-08-14
**Status:** LOCKED — Active v1.0.0
**Reference:** Rule 27.5 Lock Report

## 1. Scope Completed

| Deliverable | Path | Status |
|---|---|---|
| Audit graph | `src/renderer/knowledge/audit-graph.json` | OK |
| Graph schema (frozen) | `repository/schema/audit-graph.schema.json` | OK |
| Standalone validator | `scripts/verify-audit-graph.js` (27 checks) | OK |
| Unified audit pack | `scripts/verify-audit.js` — `auditAg1()` (21 checks) | OK |
| Package script | `npm run verify:audit-graph` | OK |
| Registry entry | `repository/graph-registry.json` — Active v1.0.0 | OK |
| Phase report | `reports/phase-ag-1-audit-intelligence-graph-report.md` | OK |
| Stabilization report | `docs/architecture/ag-1-audit-intelligence-graph-stabilization-report.md` | OK |
| Certification report | `docs/architecture/ag-1-audit-intelligence-graph-certification-report.md` | OK |
| Graph status cleanup | RG-1 generator + generated outputs; FF-1 graph | OK |
| Registry reconciliation | `historicalStages`, FF-1/KG-4 rows, `futureGraph` N/A, registry v1.2.0 | OK |

## 2. Graph Properties (Locked)

| Property | Value |
|---|---|
| Version / Schema | 1.0.0 / 1.0.0 (frozen) |
| Events | 97 (40 critical, 41 sensitive, 16 informational) |
| Modules / Mutations / Actors | 14 / 25 / 9 |
| Approvals / Compliance / Trust boundaries | 4 / 7 / 4 |
| Audit stores | 3 (audit_log, allocation_audit, voucher_proposal_audit) |
| Source documents | 21 (all resolve) |
| Live data embedded | None |

## 3. Verification Results

| Command | Result |
|---|---|
| `node scripts/verify-audit-graph.js` | PASS 27/27 |
| `node scripts/verify-audit.js --phase=ag-1` | PASS 41/41 |
| `node scripts/verify-audit.js` | PASS 225/3 INFO/0 FAIL |
| `node scripts/verify-feature-function-graph.js` | PASS 31/31 |
| `npm run lint:syntax` | PASS |
| `npm run build` | PASS |
| `node scripts/verify-erp.js` | PASS WITH WARNINGS (governed FSR-1 pair only); Safe to Commit: Yes |

## 4. Certification Status

**CERTIFIED** (see `docs/architecture/ag-1-audit-intelligence-graph-certification-report.md`). Evidence-based: graph content cross-checked against `init.js`, `schemaDefinitions.js`, `bankReconciliationService.js`, 61 `auditLog` call sites, `audit:*` IPC surface, and DG-1 cross-mapping.

## 5. Known Limitations

1. Runtime mapping of live `audit_log` rows to AG-1 event IDs not implemented (descriptive catalog by design).
2. Governed FSR-1 gap pair (verify:erp checks 9, 16) — open under its own programme (assigned to FSR-2B).
3. RG-2 stray reference UNVERIFIED — awaiting owner confirmation.
4. Desktop smoke test marked not applicable — AG-1 changed no runtime behavior.

## 6. Outstanding Risks

| Risk | Severity | Status |
|---|---|---|
| Documentation drift in old KG roadmap (KG-3/6/7 wording) | Medium | Mitigated — historicalStages in registry v1.2.0; historical reports intentionally unchanged |
| Live audit-row mapping gap | Low | Future AG-2/runtime phase |
| FSR-1 governed gaps | Medium | Own programme (FSR-2B) |

## 7. Safe-to-Lock Decision

**SAFE TO LOCK.** Commit history: `92aa0a8` (AG-1 implementation), `e45fcb6` (stabilization), `5c3c5f5` (registry reconciliation update) — all pushed to `origin/phase-16-enterprise-crm-integration`. Working tree clean at lock time.

## 8. What Is Locked

1. `audit-graph.json` + frozen schema 1.0.0.
2. `verify-audit-graph.js` and AG-1 pack in `verify-audit.js`.
3. Registry entry AG-1 Active v1.0.0 (registry v1.2.0 with historicalStages).
4. EIL architecture guide, graph-registry.md, RG-1 generator/outputs, FF-1 graph — all consistent with AG-1 active.

## 9. What Is Out of Scope

- Runtime audit-event mapping, audit UI, or audit report changes.
- Any change to accounting, GST, inventory, voucher posting, database schema, IPC, or routes.
- KG-5 Document and Manual Graph.
- BRAIN-5 LLM gateway (deferred).

## 10. Future Changes Require a Separate Phase

- AG-1 event catalog expansion (schema minor version).
- Runtime mapping of live audit rows to AG-1 event IDs.
- New audit stores or compliance controls.
- KG-5 Document and Manual Graph (recommended next programme).

## 11. Next Recommended Programme

**KG-5 Document and Manual Graph** — the only genuinely pending graph from the historical roadmap (per `docs/architecture/graph-roadmap-reconciliation-audit.md`), pending Executive Architecture Gate approval.

---
*Lock report generated: 2026-08-14*