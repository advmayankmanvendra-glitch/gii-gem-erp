# GII GeM ERP — Unified Graph Registry

## GI-EGS Compliance Reference

Apply GI-EGS (Gesture India Engineering Standards) standards.

Canonical GI-EGS repository:
https://github.com/advmayankmanvendra-glitch/GI-ENGINEERING-STANDARDS

Refer to the GI-EGS master governance rules for engineering standards, documentation discipline, audit procedure, architecture control, naming conventions, acronym expansion, Codex/OpenCode review process, and clearance protocol.

Do not redefine, duplicate, override, or maintain separate engineering standards inside this project. This project must only consume and comply with GI-EGS standards.

## Purpose

The Graph Registry is the single source of truth for every structured knowledge graph in the GII GeM ERP ecosystem. Each graph is a versioned, auditable, read-only knowledge artifact that enables AI tools (Codex, OpenCode, ChatGPT) and human developers to navigate the project without scanning raw source files.

## Registry

| Graph ID | Name | Phase | Purpose | Source Folders | Output Files | Mutability | Owner Module | Audit Pack | Status |
|----------|------|-------|---------|---------------|--------------|------------|--------------|------------|--------|
| BRAIN-1 | ERP Knowledge Graph | BRAIN-1 | Structured ERP knowledge — modules, workflows, reports, screens, rules, glossary, navigation, errors | `src/renderer/modules/erpBrain/repository/` | `repository/*/index.json` | Read-only | erpBrain | verify:audit --phase=brain-1 | **Active** |
| KG-1 | Metadata / Impact Graph | KG-1 | Metadata registry — source/impact, risk, permissions, correction policies | `src/renderer/knowledge/modules/` | `knowledge/modules/*.js` | Read-only | knowledge | verify:audit --phase=kg-1 | **Active** |
| RG-1 | Renderer Dependency Graph | 17L | Renderer import/screen/component/IPC/database dependency map | `src/renderer/` | `knowledge/renderer-graph.json`, `knowledge/renderer-graph.md`, `knowledge/renderer-summary.md` | Read-only | knowledge | verify:audit --phase=17-l | **Active** |
| DG-1 | Database Graph | DG-1 | Database tables, columns, relationships, triggers, indices | `src/main/database/`, `src/main/services/` | `knowledge/database-graph.json` | Read-only | knowledge | verify:audit --phase=dg-1 | **Active** |
| WG-1 | Workflow Graph | WG-1 | Business workflow state machines, transitions, pre/post conditions | `docs/architecture/`, `src/main/services/` | `knowledge/workflow-graph.json` | Read-only | knowledge | verify:audit --phase=wg-1 | **Active** |
| KG-4 | Voucher and Accounting Graph | KG-4 | Voucher types, posting functions, debit/credit patterns, GST/inventory impact, reversal rules, accounting protection boundaries | `src/main/services/`, `src/main/database/` | `knowledge/voucher-accounting-graph.json` | Read-only | knowledge | verify:audit --phase=kg-4 | **Active** |
| FF-1 | Feature Function Correlation Graph | FF-1 | Correlates ERP features to functions, screens, workflows, tables, voucher types, reports, manuals, safety boundaries; relationship-based query routing for Ask ERP Brain | `src/renderer/knowledge/`, `src/renderer/modules/erpBrain/`, `docs/manuals/`, `docs/architecture/` | `knowledge/feature-function-graph.json` | Read-only | knowledge | verify:audit --phase=ff-1 | **Active** |
| AG-1 | Audit Graph | AG-1 | Audit event lineage — events → modules → screens → data mutations → users | `src/main/services/`, `src/main/database/` | `knowledge/audit-graph.json` | Read-only | knowledge | verify:audit --phase=ag-1 | **Active** |

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
| KG-4 | `verify:audit --phase=kg-4` | Voucher/posting-function mapping, ledger/receivable/GST/inventory impact, reversal rules, audit trail, protected boundaries |
| FF-1 | `verify:audit --phase=ff-1` | Feature/function correlation coverage, edge resolution, routing targets; also `npm run verify:feature-function-graph` |
| AG-1 | `verify:audit --phase=ag-1` | Event→module→screen→mutation→user mapping, critical action classification, missing coverage, tamper-risk; also `npm run verify:audit-graph` |

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
| 1.1 | 2026-08-11 | Architecture Governance | AG-1 Audit Graph Active — audit action catalog, schema, validation pack; DG-1/WG-1 reflect Active |
| 1.2 | 2026-08-14 | Architecture Governance | Registry update (approved reconciliation) — KG-4 and FF-1 rows added to main table and audit packs; `historicalStages` section added (BRAIN-2..5, KG-2/3/5/6/7/8/9/10, RG-2, WG-2/3, FF-2); `futureGraph` fields revised to N/A (FF-2 runtime routing completed via BRAIN-4.3B); live registry JSON synced to 1.2.0 |

## Historical Stages

Stages below are roadmap/history records, not standalone active graph entries. They are preserved so auditors can trace older KG/BRAIN/WG/FF numbering to current graphs.

| Stage | Recommended Status | Successor / Current Home |
|-------|--------------------|--------------------------|
| BRAIN-2 Source-backed search and answer service | COMPLETED | BRAIN-1 service layer |
| BRAIN-3 Contextual Help Assistant integration | COMPLETED | Help Assistant over BRAIN-2 |
| BRAIN-4 Read-only Ask ERP Brain assistant | COMPLETED | Ask ERP Brain runtime assistant |
| BRAIN-5 LLM gateway feasibility | DEFERRED | None |
| KG-2 Historical workflow graph stage | MERGED | WG-1 |
| KG-3 Historical database graph stage | SUPERSEDED | DG-1 |
| KG-5 Document and Manual Graph | PLANNED | None (recommended next graph) |
| KG-6 Historical renderer dependency graph stage | MERGED | RG-1 |
| KG-7 Historical verification and audit graph stage | SUPERSEDED | AG-1 |
| KG-8 Knowledge Search Index | MERGED | BRAIN-2 |
| KG-9 Contextual Help Mapping | MERGED | BRAIN-3 |
| KG-10 Knowledge validation and governance | MERGED | AG-1 / EIL registry |
| RG-2 Stray AIR renderer graph reference | UNVERIFIED | None (awaiting owner confirmation) |
| WG-2 Workflow Enforcement Readiness Audit | COMPLETED | WG-3A |
| WG-3 Workflow Enforcement Foundation family | COMPLETED | WG-3A workflow stage engine |
| FF-2 Runtime routing (formerly future in FF-1 metadata) | COMPLETED | BRAIN-4.3B using FF-1 |
