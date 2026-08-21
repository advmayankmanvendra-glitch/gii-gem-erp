# KG-5 Document and Manual Graph — Lock Report

> **GGR-1 current-authority notice (2026-08-21):** This is the preserved 2026-08-14 historical lock record. It does not prove a separately evidenced Rule 27 stabilization step. See `kg-5-document-and-manual-graph-lifecycle-reconciliation-addendum.md`; KG-5 remains ACTIVE, while BRAIN-3.5 runtime consumption remains BLOCKED pending the later stabilization, re-certification and baseline-lock gate.

**Programme:** KG-5 Document and Manual Graph
**Lock Date:** 2026-08-14
**Status:** LOCKED — Active v1.0.0
**Reference:** Rule 27.5 Lock Report (permanent historical reference)

## 1. Scope Completed

| Deliverable | Path | Status |
|---|---|---|
| Architecture audit | `docs/architecture/kg-5-document-and-manual-graph-architecture-audit.md` | OK |
| Graph schema (frozen) | `repository/schema/manual-graph.schema.json` | OK |
| Regeneration tool | `scripts/build-manual-graph.js` | OK |
| Standalone validator | `scripts/verify-manual-graph.js` (30 checks) | OK |
| Graph artifact | `src/renderer/knowledge/manual-graph.json` | OK |
| Unified audit pack | `scripts/verify-audit.js` — `auditKg5()` (21 checks) | OK |
| Package script | `npm run verify:manual-graph` | OK |
| Registry entry | `repository/graph-registry.json` — Active v1.0.0 (registry v1.3.0) | OK |
| Phase report | `reports/phase-kg-5-manual-graph-report.md` | OK |
| Lock note | `docs/architecture/kg-5-manual-graph-lock-note.md` | OK |
| Certification report | `docs/architecture/kg-5-document-and-manual-graph-certification-report.md` | OK |
| Docs rows | `graph-registry.md`, `enterprise-intelligence-layer.md` | OK |

## 2. Graph Properties (Locked)

| Property | Value |
|---|---|
| Version / Schema | 1.0.0 / 1.0.0 (frozen) |
| Manuals / Sections | 10 / 75 |
| References | 223 (101 feature, 30 stage, 26 screen, 41 report, 25 error) — all resolve |
| Source documents | 10 (all resolve) |
| Known gaps | 3 |
| Live data embedded | None |

## 3. Verification Results

| Command | Result |
|---|---|
| `npm.cmd run lint:syntax` | PASS |
| `npm.cmd run build` | PASS |
| `npm run verify:manual-graph` | PASS 30/30 |
| `node scripts/verify-audit.js --phase=kg-5` | PASS 38/38 |
| `node scripts/verify-audit.js` | PASS 244/3 INFO/0 FAIL |
| `node scripts/verify-erp.js` | PASS WITH WARNINGS (governed FSR-1 pair only); Safe to Commit: Yes |

## 4. Certification Status

**CERTIFIED** (see `docs/architecture/kg-5-document-and-manual-graph-certification-report.md`). Evidence-based: manual inventory, section index, and all 223 cross-references verified against `docs/manuals/`, `manualIndex.js`, `manualLoader.js`, FF-1, WG-1, RG-1, and BRAIN-1.

## 5. Known Limitations

1. 3 orphaned `manualIndex.js` keys (KG5-GAP-001) — cleanup is a separate maintenance task.
2. BRAIN-1 manuals repository entry absent (KG5-GAP-002).
3. WG-1 helpRefs cover only the Complete User Operations Manual (KG5-GAP-003).
4. Runtime KG-5 consumption requires a separate approved phase.
5. Desktop smoke test not applicable — knowledge-only programme.

## 6. Outstanding Risks

| Risk | Severity | Status |
|---|---|---|
| Manual content staleness | Low | `status` field per manual; KG5-GAP-002 tracks BRAIN-1 gap |
| Cross-reference drift after future graph changes | Low | Validator enforces resolution; regeneration governed |
| FSR-1 governed gaps (checks 9, 16) | Medium | Own programme (FSR-2B) — unrelated to KG-5 |

## 7. Safe-to-Lock Decision

**SAFE TO LOCK.** Commit `2244bb8` (KG-5 implementation + lock note) pushed to `origin/phase-16-enterprise-crm-integration`; working tree clean at lock time.

## 8. What Is Locked

1. `manual-graph.json` + frozen schema 1.0.0.
2. `verify-manual-graph.js` (30 checks) and `auditKg5()` pack in `verify-audit.js`.
3. `build-manual-graph.js` regeneration tool.
4. Registry entry KG-5 Active v1.0.0 (registry v1.3.0, 9 active graphs).
5. EIL guide + graph-registry.md rows.

## 9. What Is Out of Scope

- Runtime Help Assistant / Ask ERP Brain wiring of manual data.
- BRAIN-1 manuals repository entry.
- Orphaned index key cleanup.
- Any runtime ERP modification.

## 10. Future Changes Require a Separate Phase

- KG-5 schema changes (version increment + governance review).
- New cross-reference types (e.g., per-section mapping).
- Runtime manual consumption wiring.
- Manual regeneration after content changes.

## 11. Next Recommended Programme

**BRAIN-3.5 / KG-5 runtime consumption** — wiring the certified manual knowledge into Help Assistant and Ask ERP Brain (separate approved phase). BRAIN-5 LLM gateway remains DEFERRED. RG-2 remains UNVERIFIED awaiting owner clarification.

---
*Lock report generated: 2026-08-14*
