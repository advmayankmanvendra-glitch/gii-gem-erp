# GII GeM ERP — Unified Graph Registry

## Purpose

The Graph Registry is the single source of truth for every structured knowledge graph in the GII GeM ERP ecosystem. Each graph is a versioned, auditable, read-only knowledge artifact that enables AI tools (Codex, OpenCode, ChatGPT) and human developers to navigate the project without scanning raw source files.

## Registry

| Graph ID | Name | Phase | Purpose | Source Folders | Output Files | Mutability | Owner Module | Audit Pack | Status |
|----------|------|-------|---------|---------------|--------------|------------|--------------|------------|--------|
| BRAIN-1 | ERP Knowledge Graph | BRAIN-1 | Structured ERP knowledge — modules, workflows, reports, screens, rules, glossary, navigation, errors | `src/renderer/modules/erpBrain/repository/` | `repository/*/index.json` | Read-only | erpBrain | verify:audit --phase=brain-1 | **Active** |
| KG-1 | Metadata / Impact Graph | KG-1 | Metadata registry — source/impact, risk, permissions, correction policies | `src/renderer/knowledge/modules/` | `knowledge/modules/*.js` | Read-only | knowledge | verify:audit --phase=kg-1 | **Active** |
| RG-1 | Renderer Dependency Graph | 17L | Renderer import/screen/component/IPC/database dependency map | `src/renderer/` | `knowledge/renderer-graph.json`, `knowledge/renderer-graph.md`, `knowledge/renderer-summary.md` | Read-only | knowledge | verify:audit --phase=17-l | **Active** |
| DG-1 | Database Graph | Future | Database tables, columns, relationships, triggers, indices | `src/main/database/` | TBD | Read-only | TBD | verify:audit --phase=dg-1 | Planned |
| WG-1 | Workflow Graph | Future | Business workflow state machines, transitions, pre/post conditions | TBD | TBD | Read-only | TBD | verify:audit --phase=wg-1 | Planned |
| AG-1 | Audit Graph | Future | Audit event lineage — events → modules → screens → data mutations → users | TBD | TBD | Read-only | TBD | verify:audit --phase=ag-1 | Planned |

## Graph Integrity Rules (Common to All Graphs)

1. **Unique node IDs** — Every graph node has a globally unique identifier within its graph.
2. **Resolved edge references** — Every edge target references an existing node. No dangling references.
3. **Deterministic output** — Given the same source state, the graph must produce identical output.
4. **Read-only by default** — Graph files must not be mutated unless the phase explicitly permits write access.
5. **No live business data** — Graphs must not contain sensitive live transactional data unless explicitly classified and approved.
6. **Source metadata** — Every graph entry records its source file, line range, and generation timestamp.
7. **Versioned** — Every graph has a version string and last-updated timestamp.
8. **Verifiable** — Every graph has a corresponding audit pack that can be run via `verify:audit --phase=<id>`.

## Audit Pack Reference

| Pack | Command | Checks |
|------|---------|--------|
| BRAIN-1 | `verify:audit --phase=brain-1` | JSON validity, unique IDs, structural validity, internal reference resolution, search/loader health, no DB/write/posting imports |
| KG-1 | `verify:audit --phase=kg-1` | Entry completeness, unique IDs, edge resolution, orphan detection, no live data, read-only compliance |
| RG-1 | `verify:audit --phase=17-l` | Graph existence, dependency count, circular imports, large files, direct DB imports, safe-extraction candidates |
| DG-1 | `verify:audit --phase=dg-1` | Table/column/FK/index/trigger mapping, sensitive table classification, orphan/reset/migration risk |
| WG-1 | `verify:audit --phase=wg-1` | State/transition mapping, pre/post conditions, blocked/recovery paths, lifecycle gap detection |
| AG-1 | `verify:audit --phase=ag-1` | Event→module→screen→mutation→user mapping, critical action classification, missing coverage, tamper-risk |

## Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | PASS | All checks passed |
| 1 | WARNING | Non-blocking issues found |
| 2 | FAIL | Blocking issues found |
| 3 | CRITICAL | Data integrity or security risk detected |

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-30 | Architecture Governance | Initial registry — BRAIN-1, KG-1 active; RG-1 planned; DG-1, WG-1, AG-1 future |
