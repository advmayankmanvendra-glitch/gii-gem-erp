# FF-1 Feature Function Correlation Graph — Lock Note

**Graph ID:** FF-1
**Version:** 1.0.0
**Graph Name:** Feature Function Correlation Graph
**Schema Version:** 1.0.0
**Status:** LOCKED

**Lock Date:** 2026-07-15
**Phase:** BRAIN-4.3A
**Subsequent Phase:** BRAIN-4.3B (runtime routing, committed separately)

---

## Lock Confirmation Checklist

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | FF-1 graph file exists | ✅ | `src/renderer/knowledge/feature-function-graph.json` |
| 2 | FF-1 schema exists | ✅ | `repository/schema/feature-function-graph.schema.json` |
| 3 | FF-1 validator exists | ✅ | `scripts/verify-feature-function-graph.js` — 31 checks |
| 4 | Registered in graph-registry.json | ✅ | `repository/graph-registry.json` — Active, ID FF-1 |
| 5 | Dependencies correct | ✅ | KG-1, WG-1, DG-1, KG-4, RG-1, BRAIN-1 |
| 6a | 50 features | ✅ | FEA-01 through FEA-50 |
| 6b | 15 functions | ✅ | FNC-01 through FNC-15 |
| 6c | 174 correlation edges | ✅ | 8 relationship types |
| 6d | 25 aliases | ✅ | In aliasMap and per-feature aliases |
| 6e | 15 natural question patterns | ✅ | In naturalQuestionMap |
| 7 | verify:feature-function-graph passes | ✅ | **31/31 PASS** |
| 8 | verify:audit --phase=ff-1 passes | ✅ | **35 PASS, 5 WARN, 0 FAIL** |
| 9 | verify:read-only-assistant passes | ✅ | **42/42 PASS** |
| 10 | verify:erp-brain passes | ✅ | **51/51 PASS** |
| 11 | verify:help-assistant-brain passes | ✅ | **23/23 PASS** |
| 12 | No runtime changes | ✅ | No ERP, database, UI, LLM, IPC, preload, accounting, voucher, report SQL, GST, or inventory logic changed |

---

## Files Under Lock

| File | Role |
|------|------|
| `src/renderer/knowledge/feature-function-graph.json` | FF-1 graph (50 features, 15 functions, 174 edges) |
| `repository/schema/feature-function-graph.schema.json` | FF-1 JSON Schema |
| `scripts/verify-feature-function-graph.js` | FF-1 validator (31 checks) |
| `repository/graph-registry.json` | Graph registry (FF-1 entry) |
| `scripts/verify-audit.js` | Audit integration (FF-1 audit pack) |
| `package.json` | Script: `verify:feature-function-graph` |
| `docs/architecture/ff-1-feature-function-correlation-graph-report.md` | FF-1 foundation report |

---

## What Is Locked

- FF-1 is the **feature-function correlation foundation** for the Enterprise Intelligence Layer
- FF-1 **maps** 50 ERP features to functions, screens, workflow stages, database tables, voucher types, reports, manuals, and safety boundaries
- FF-1 **enables** the Ask ERP Brain runtime routing (implemented in BRAIN-4.3B)
- All 31 FF-1 verification checks and 35 FF-1 audit checks pass
- FF-1 is **backward compatible** with all existing graphs and BRAIN services

---

## What Is Out of Scope

- Runtime query routing — implemented in a separate phase (BRAIN-4.3B)
- Natural language relevance certification — blocked (BRAIN-4.2)
- AG-1 Audit Intelligence Graph — planned future graph
- LLM integration — not planned (BRAIN-5A recommendation: do not implement)
- Any modifications to ERP accounting, voucher, inventory, GST, database, or UI logic

---

## Future Changes Requiring a Separate Phase

1. **Adding new feature nodes to FF-1** — must increment version and re-verify
2. **Modifying existing feature/function mappings** — must update correlation edges and re-verify
3. **Removing any locked feature** — requires architecture review and major version bump
4. **Any runtime integration beyond BRAIN-4.3B** — must be a separate named phase

---

## Lock Decision

**FF-1 v1.0.0 is LOCKED as the feature-function correlation foundation for the Enterprise Intelligence Layer.**

All criteria satisfied. No runtime ERP behavior was changed. The graph, schema, validator, registry, and audit pack are frozen at version 1.0.0.

---

*End of FF-1 Feature Function Correlation Graph Lock Note*
