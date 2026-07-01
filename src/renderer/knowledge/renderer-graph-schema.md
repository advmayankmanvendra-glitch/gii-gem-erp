# RG-1 Renderer Dependency Graph — Schema Guide

**Schema Version:** 1.0.0
**Graph ID:** RG-1
**Schema File:** `src/renderer/knowledge/renderer-graph.schema.json`
**Graph File:** `src/renderer/knowledge/renderer-graph.json`

---

## Purpose

The RG-1 schema (`renderer-graph.schema.json`) defines the permanent, backward-compatible structure of the Renderer Dependency Graph (`renderer-graph.json`). It serves as the contract between:

- **Build tools** (`scripts/build-renderer-graph.js`) that generate the graph
- **AI agents** (Codex, OpenCode, ChatGPT) that consume the graph for navigation, analysis, and planning
- **Verification scripts** (`scripts/verify-audit.js`) that validate graph integrity
- **Future graphs** (DG-1, WG-1, AG-1) that may reference RG-1

Any tool that reads `renderer-graph.json` can rely on the schema being stable within a major version.

---

## Required Fields

These top-level fields **must** be present in every valid `renderer-graph.json`:

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | string | Must be `"1.0.0"` |
| `graphId` | string | Must be `"RG-1"` |
| `generatedAt` | string (ISO 8601) | Timestamp of graph generation |
| `sourceRoot` | string | e.g. `"src/renderer/"` |
| `filesScanned` | integer | Count of source files scanned |
| `statistics` | object | Aggregate stats (see below) |
| `routes` | array of objects | Route key definitions |
| `screens` | array of objects | Screen file metadata |
| `components` | array of objects | Component file metadata |
| `contexts` | array of objects | React context definitions |
| `dialogs` | array of objects | Shared dialog definitions |
| `print` | object | Print template system structure |
| `dependencies` | object | External dependency mapping |
| `ipcReferences` | array of strings | IPC channels used |
| `risk` | object | Risk assessment data |
| `intelligenceLayer` | object | BRAIN-1/KG-1 integration |
| `metadata` | object | Graph metadata (name, version, etc.) |

### Statistics Sub-Fields

The `statistics` object requires:

- `filesByCategory`, `filesByRisk`, `filesByCriticality`, `filesByOwner`, `filesByChangeFrequency`
- `avgImportsPerScreen`, `avgComponentReuse`
- `largestComponent`, `largestScreen`
- `layerCount`, `architectureDensity`
- `mostConnected`, `mostDepended`, `highRiskFiles`
- `totalRoutes`, `totalScreens`, `totalComponents`, `totalFeatures`, `totalModules`, `totalConfigFiles`
- `circularImports`, `circularImportDetails`
- `approximateTokenSavings`

---

## Optional Fields

The following fields may be absent or empty:

- `heatMap` — dependency heat map (fan-out, fan-in, most shared)
- `evolution` — renderer evolution roadmap (current → Phase 17 → Phase 18 → future)
- `edges` — import edge list (may be truncated)
- `features` — feature module entries
- `knowledge` — knowledge graph references (may be inside `intelligenceLayer`)
- `externalDependencies` — extended dependency info (may be inside `dependencies`)

Any new top-level field added in future schema versions must be optional.

---

## Compatibility Rules

### Backward Compatible Changes (Minor/Patch Version Bump)

Allowed without changing `schemaVersion`:

- **Adding optional fields** at any level
- **Adding new metadata sections** under existing objects
- **Adding new relationship arrays** (e.g. new graph type arrays)
- **Adding future graph references** such as DG-1, WG-1, AG-1 references
- **Extending enum values** (e.g. adding new `businessCriticality` values)
- **Adding new properties** to any object beyond the required minimum

### Breaking Changes (Require Major Version Bump)

The `schemaVersion` **must** be incremented to `"2.0.0"` (or higher) if:

- Any required top-level field is removed or renamed
- Any required sub-field is removed or renamed
- The semantic meaning of an existing field changes
- Object structure is changed incompatibly (e.g. changing an array of strings to an array of objects)
- A required field becomes optional

### Version Format

`schemaVersion` follows `MAJOR.MINOR.PATCH`:

- **MAJOR:** Breaking structural changes (not backward compatible)
- **MINOR:** Backward-compatible additions (new optional fields, new metadata)
- **PATCH:** Backward-compatible fixes (clarifications, relaxed constraints)

---

## Versioning Policy

| Action | Version Change | Example |
|--------|---------------|---------|
| Initial freeze | 1.0.0 | This document |
| Add optional field | 1.1.0 | Add `securityAudit` section |
| Add new enum value | 1.1.0 | Add `"Urgent"` to `changeFrequency` |
| Remove required field | 2.0.0 | Remove `circularImports` from statistics |
| Rename field | 2.0.0 | Rename `sourceRoot` to `sourceDirectory` |
| Change field type | 2.0.0 | Change `consumers` from string to array |

---

## Regeneration Rules

Every time `scripts/build-renderer-graph.js` runs:

1. The output `renderer-graph.json` **must** include `schemaVersion: "1.0.0"`
2. The output `renderer-graph.json` **must** include `graphId: "RG-1"`
3. All required fields **must** be present
4. No required field may be omitted even if empty
5. The generated JSON **must** conform to `renderer-graph.schema.json`
6. The schema file itself is **frozen** and must not be regenerated automatically

If the build script cannot satisfy a required field (e.g. `filesScanned` is 0 due to error), it must use a fallback value rather than omit the field.

---

## AI Consumption Guide

### For Codex, OpenCode, and ChatGPT

When reading `renderer-graph.json`:

1. **Always check `schemaVersion` first.** If `schemaVersion` is not `"1.0.0"`, look for a newer schema guide.

2. **Use required fields for mandatory lookups.** If a field is not required, it may be absent — check with `if (graph.fieldName)` before reading.

3. **`statistics` is the entry point** for understanding the renderer. Start with:
   - `statistics.mostConnected` — highest-import files (best architecture entry points)
   - `statistics.highRiskFiles` — files that need attention (large, complex)
   - `statistics.filesByOwner` — who owns what
   - `statistics.filesByCriticality` — critical files to protect

4. **`routes` provides workflow context.** Each route has a `workflowReference` field linking it to a business workflow.

5. **`screens` and `components` contain AI navigation metadata:**
   - `aiNavigation.primaryEntryPoint` — main component/function name
   - `aiNavigation.relatedScreens` — screens that depend on this module
   - `aiNavigation.relatedReports` — reports that use this data
   - `aiNavigation.relatedIPC` — IPC channels invoked
   - `aiNavigation.relatedPrintTemplates` — print templates used

6. **Use `heatMap` for dependency analysis** (when present):
   - `highestFanOut` — which files import many others
   - `highestFanIn` — which modules are most depended-upon
   - `mostSharedComponents` — which UI components are reused most

7. **Use `evolution` for roadmap context** (when present):
   - Understand current architecture state
   - Plan extractions in the suggested order

8. **Do not modify the graph file.** RG-1 is read-only for AI agents. Always use the build script for regeneration.

9. **Reference RG-1 in phase reports** to document architecture impact before and after changes.

---

## Validation

### Current Implementation

The `scripts/verify-audit.js` RG-1 audit pack validates the graph against the schema by:

1. Checking that `renderer-graph.json` exists and is valid JSON
2. Verifying `graphId` is `"RG-1"`
3. Verifying `schemaVersion` is `"1.0.0"`
4. Checking all required statistics fields are present
5. Verifying screen and component metadata fields (`ownerModule`, `businessCriticality`, etc.)
6. Checking `heatMap` and `evolution` if present

### Full JSON Schema Validation (Future Improvement)

A full `$schema`-compliant validator (e.g. `ajv`) is not currently included as a dependency. This is acceptable because:

- The build script is the only generator of `renderer-graph.json`
- The audit script already checks all required fields
- The schema is frozen — structural changes require manual review

To add full validation in the future:

1. Install `ajv` (or a similar JSON Schema validator)
2. Add a `validateGraphAgainstSchema()` function in `scripts/build-renderer-graph.js`
3. Call it before writing `renderer-graph.json`
4. Add a `--validate` flag to the build script

---

## Known Limitations

1. **Schema is descriptive, not generative** — The schema describes the expected structure but does not auto-generate graph data.
2. **No `$ref` usage** — Schema uses inline definitions for simplicity. Future versions may extract `-$defs`.
3. **Enum values are not exhaustive** — `businessCriticality` and `changeFrequency` enums may be extended in minor versions.
4. **`consumers` field uses union type** (`string | array`) — Some contexts may list a single string consumer rather than an array.
5. **No cross-file format validation** — Schema validates the JSON structure but not cross-references between files (e.g. route-to-screen mapping).
