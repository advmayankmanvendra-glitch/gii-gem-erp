# Enterprise Intelligence Layer — Architecture Guide

**Version:** 1.0.0
**Status:** Active (Frozen)
**Last Updated:** 2026-08-21

---

## Purpose

The Enterprise Intelligence Layer (EIL) is the permanent architectural intelligence framework for GII GeM ERP.

It establishes a unified, versioned, and discoverable set of structured knowledge repositories (graphs) that describe every aspect of the ERP — business knowledge, metadata, dependencies, workflows, and audit trails.

Future AI tools (Codex, OpenCode, ChatGPT, and internal AI systems) shall use the Enterprise Intelligence Layer as their primary navigation and reasoning layer, rather than repeatedly scanning raw source code.

---

## Layers

| Layer | ID | Status | Purpose |
|-------|-----|--------|---------|
| ERP Knowledge Repository | BRAIN-1 | **Active** | Business knowledge, glossary, modules, workflows, navigation, business rules |
| Metadata Registry | KG-1 | **Active** | Metadata, ownership, permissions, risks, traceability, correction policies |
| Renderer Intelligence Graph | RG-1 | **Active** | Renderer dependency graph, routes, screens, components, contexts, dialogs, IPC |
| Database Intelligence Graph | DG-1 | **Active** | Database schema, tables, columns, relationships, indices, triggers |
| Workflow Intelligence Graph | WG-1 | **Active** | Workflow graph, lifecycle states, transitions, pre/post conditions |
| Voucher and Accounting Graph | KG-4 | **Active** | Voucher types, posting functions, debit/credit patterns, GST/inventory impact, reversal rules |
| Feature Function Correlation Graph | FF-1 | **Active** | Feature-to-function/screen/table/report correlation; query routing for Ask ERP Brain |
| Audit Intelligence Graph | AG-1 | **Active** | Audit events, mutations, users, approvals, compliance |
| Document and Manual Graph | KG-5 | **Active** | Manual inventory with section indexes and cross-references to features, stages, screens, reports, errors |

---

## Graph Lifecycle Statuses

The canonical machine statuses are `ACTIVE`, `COMPLETED`, `MERGED`, `SUPERSEDED`, `PLANNED`, `DEFERRED`, `RETIRED` and `UNVERIFIED`. Their authoritative definitions and legacy-value mapping are in `repository/graph-registry.json` under `lifecyclePolicy`.

`ACTIVE` means a graph asset exists, is registered, is schema-valid and passes its verification. It does not mean the graph is consumed at runtime, has no future obligations, or makes the wider ERP production-ready.

The legacy display value `Active` remains in current primary records for backward compatibility. The canonical `lifecycleStatus` field is authoritative for reconciliation and counts.

---

## Relationships

```
BRAIN-1
  │
  ▼
KG-1
  │
  ▼
RG-1
  │
  ▼
DG-1
  │
  ▼
WG-1
  │
  ├────────────────────────────┐
  ▼                            ▼
KG-4 (voucher/accounting)   AG-1 (audit intelligence)
  │
  ▼
FF-1 (feature correlation, branch of KG-4 and the graph chain)
  │
  ▼
KG-5 (document/manual inventory, branch of FF-1 and WG-1)
```

Each graph references the ones it depends on. No graph exists in isolation.

| Graph | References | Referenced By |
|-------|-----------|---------------|
| BRAIN-1 | — | KG-1, RG-1, DG-1, WG-1, KG-4, FF-1, AG-1, KG-5 |
| KG-1 | BRAIN-1 | RG-1, DG-1, WG-1, KG-4, FF-1, AG-1, KG-5 |
| RG-1 | BRAIN-1, KG-1 | DG-1, WG-1, KG-4, FF-1, AG-1, KG-5 |
| DG-1 | BRAIN-1, KG-1, RG-1 | WG-1, KG-4, AG-1, FF-1 |
| WG-1 | BRAIN-1, KG-1, RG-1, DG-1 | KG-4, FF-1, AG-1, KG-5 |
| KG-4 | BRAIN-1, KG-1, RG-1, DG-1, WG-1 | AG-1, FF-1 |
| FF-1 | BRAIN-1, KG-1, RG-1, DG-1, WG-1, KG-4 | KG-5 |
| AG-1 | BRAIN-1, KG-1, RG-1, DG-1, WG-1, KG-4 | — |
| KG-5 | BRAIN-1, KG-1, RG-1, WG-1, FF-1 | — |

---

## Version Policy

All schemas are frozen at **1.0.0**.

- No incompatible change may occur without a major schema version increment.
- Future minor versions (1.x) allow only additive changes.
- Never rename or remove required fields.
- Schema changes require governance approval.

---

## Schema Compatibility

Every graph schema declares:

- `schemaVersion` — Semantic version of the schema
- `graphId` — Unique graph identifier
- `generatedAt` — Timestamp of last generation
- `owner` — Responsible team
- `description` — Purpose
- `dependencies` — Cross-graph dependency declarations
- `relationships` — Internal cross-reference metadata
- `risk` — Risk assessment
- `metadata` — Repository metadata
- `statistics` — Aggregate counts and metrics
- `compatibility` — Allowed and breaking changes
- `futureExtensions` — Planned additions

### Allowed Changes (Minor/Patch)

- Add optional fields
- Extend enum values
- Add new metadata sections
- Add new relationship types
- Add future graph references

### Breaking Changes (Major)

- Remove or rename required fields
- Change semantic meaning of existing fields
- Change object structure incompatibly
- Make a required field optional

---

## Graph Regeneration Policy

Every graph must document:

| Property | Description |
|----------|-------------|
| Generation tool | Script or process that creates the graph |
| Generation date | ISO 8601 timestamp in `generatedAt` |
| Source directories | Directories scanned for graph data |
| Validation method | How the graph is validated after generation |
| Regeneration trigger | What events cause regeneration |

Active graph regeneration:

- **RG-1** — `scripts/build-renderer-graph.js` — regenerated when renderer source changes significantly
- **BRAIN-1** — Hand-authored — regenerated during architecture audit phases
- **KG-1** — Hand-authored — regenerated during architecture audit phases
- **DG-1** — Hand-authored — regenerated when database schema or service structure changes significantly
- **WG-1** — Hand-authored — regenerated when lifecycle stages or governance rules change
- **KG-4** — Hand-authored — regenerated when voucher types, posting functions, or accounting logic change significantly
- **FF-1** — Hand-authored — regenerated when features, screens, workflows, or database tables change significantly
- **AG-1** — Hand-authored from the audit action catalog — regenerated when audit actions, audit tables, or audit modules change in `src/main`
- **KG-5** — `scripts/build-manual-graph.js` — regenerated when manuals change, when the manual section index changes, or when referenced graphs change

---

## AI Consumption Policy

Future AI tools shall:

1. **Read `repository/graph-registry.json`** — Discover all available graphs, their locations, schemas, and dependency order.
2. **Determine required graph(s)** — Identify which graphs are needed for the current task.
3. **Load only required graph(s)** — Avoid loading all graphs when only one is needed.
4. **Avoid repository-wide scans** whenever graph data is sufficient.

This is the standard operating procedure for:

- Codex
- OpenCode
- ChatGPT
- Future internal AI systems

### AI Consumption Rules

When reading any graph:

1. Always check `schemaVersion` first. If it is not `1.0.0`, look for a newer schema guide.
2. Use the `statistics` section as the entry point for understanding the graph.
3. Navigate via `routes[].workflowReference` (RG-1) or `relatedModules`/`relatedReports` (BRAIN-1, KG-1) for business context.
4. Use `screens[].aiNavigation` for cross-file navigation (RG-1).
5. Use cross-references (`relatedModules`, `relatedReports`, etc.) to traverse the knowledge graph.
6. Never modify graph files directly. Always use the documented generation tool.
7. Reference the Enterprise Intelligence Layer in phase reports to document architecture impact.

---

## Future Expansion Policy

The Enterprise Intelligence Layer is designed to grow. Future additions must:

1. **Register** — Add an entry in `repository/graph-registry.json`
2. **Declare dependencies** — Specify which existing graphs the new graph depends on
3. **Declare compatibility** — Ensure the new graph schema is compatible with existing graphs
4. **Provide validation** — Create an audit pack in `scripts/verify-audit.js`
5. **Provide regeneration instructions** — Document how the graph is generated
6. **Follow the Enterprise Intelligence Layer schema contract** — Include all required top-level fields

### Future Roadmap

**Near-term (Phase 17-18):**

| Item | Description |
|------|-------------|
| `minimumRequired` field | Each graph declares minimum graph versions it requires (e.g., "Renderer Refactor requires RG-1"). Enables AI planning — AI tools determine prerequisite graphs before proposing changes. |
| `enterprise-intelligence-layer.json` | Platform-level manifest (like `package.json`) containing layer version, all graphs, schemas, dependencies, and capabilities. Top-level EIL contract alongside `graph-registry.json`. |
| Consistency Engine | Automated cross-graph verification — ensures BRAIN-1 route keys match RG-1, KG-1 screen types match BRAIN-1 screen types, etc. |

**Long-term:**

| Item | Description |
|------|-------------|
| Full cross-graph sync | All 9 graphs verified as a coherent whole by the Consistency Engine |
| AI Planning Layer | AI tools propose changes, EIL validates impact across all graphs before code is written |
| Self-documenting architecture | EIL becomes source of truth — code generation, refactoring, and docs derived from graphs |

All nine Enterprise Intelligence Layer graphs are now implemented and registered as `ACTIVE`:

| Graph | Phase | Purpose |
|-------|-------|---------|
| BRAIN-1 | Active | ERP Knowledge Repository |
| KG-1 | Active | Metadata Registry |
| RG-1 | Active | Renderer Intelligence Graph |
| DG-1 | Complete | Database Intelligence Graph |
| WG-1 | Complete | Workflow Intelligence Graph |
| KG-4 | Complete | Voucher and Accounting Graph |
| FF-1 | Complete | Feature Function Correlation Graph |
| AG-1 | Complete | Audit Intelligence Graph |
| KG-5 | Complete | Document and Manual Graph |

No primary graph is currently registered as `PLANNED`; therefore the Registry Pending Count is 0. Six Active graphs retain material future obligations, so the Effective Pending Count is 6: DG-1, WG-1, KG-4, FF-1, AG-1 and KG-5.

BRAIN-3.5 / KG-5 runtime consumption is a separate planned programme, not a new KG-5 graph lifecycle state. Its execution gate remains BLOCKED until the approved corrective programme sequence reaches stabilization, certification and baseline lock.

---

## Governance

The Enterprise Intelligence Layer is a controlled architectural asset.

### Schema Changes

- Any schema change requires governance approval.
- No graph schema may change without version increment.
- Breaking changes require a Major version increment and full review.

### Phase Requirements

Every future implementation phase must:

1. Load the graph registry to understand current architecture state
2. Load relevant graphs for navigation and analysis
3. Reference the Enterprise Intelligence Layer in the phase report
4. Update affected graphs if the phase changes the architecture

### Verification

All active graphs are verified by `scripts/verify-audit.js`:

| Graph | Audit Pack | Command |
|-------|-----------|---------|
| BRAIN-1 | brain-1 | `verify:audit --phase=brain-1` |
| KG-1 | kg-1 | `verify:audit --phase=kg-1` |
| RG-1 | rg-1 | `verify:audit --phase=rg-1` |
| DG-1 | dg-1 | `npm run verify:database-graph` |
| WG-1 | wg-1 | `npm run verify:workflow-graph` |
| KG-4 | kg-4 | `npm run verify:voucher-accounting-graph` |
| FF-1 | ff-1 | `npm run verify:feature-function-graph` |
| AG-1 | ag-1 | `npm run verify:audit-graph` |
| KG-5 | kg-5 | `npm run verify:manual-graph` |

---

## Repository Structure

```
repository/
  graph-registry.json              — Single discovery point
  schema/
    brain.schema.json              — BRAIN-1 schema (frozen v1.0.0)
    kg.schema.json                 — KG-1 schema (frozen v1.0.0)
    renderer-graph.schema.json     — RG-1 schema (frozen v1.0.0)
src/renderer/
  knowledge/
    renderer-graph.json            — RG-1 graph data
    renderer-graph.schema.json     — RG-1 schema (local copy for build)
    renderer-graph-schema.md       — RG-1 schema documentation
    renderer-graph.md              — RG-1 human-readable graph
    renderer-summary.md            — RG-1 summary
    schema.js                      — KG-1 runtime schema + validation
    registry.js                    — KG-1 runtime registry
    modules/                       — KG-1 module files
  modules/
    erpBrain/
      repository/                  — BRAIN-1 repository data
        index.json                 — BRAIN-1 manifest
        modules/                   — Module definitions
        workflows/                 — Workflow definitions
        reports/                   — Report definitions
        screens/                   — Screen metadata
        rules/                     — Business rules
        glossary/                  — Terminology
        navigation/                — Navigation paths
        errors/                    — Common errors
docs/architecture/
  enterprise-intelligence-layer.md — This document
  graph-registry.md                — Graph registry (legacy)
```

---

## Safe to Lock

The Enterprise Intelligence Layer v1.0 is a frozen architectural asset.

- All active graph schemas are frozen at 1.0.0.
- The graph registry provides single-point discovery.
- Cross-graph dependencies are documented.
- AI consumption rules are established.
- Governance rules are defined.
- Verification commands pass.

**Lock artifacts:**
- `enterprise-intelligence-layer-v1`
- `brain-1-schema-v1.0.0`
- `kg-1-schema-v1.0.0`
- `rg-1-schema-v1.0.0`
- `graph-registry-v1.0.0`
