# Tally.ERP 9 Capsule System Reference

**Document Phase**: C — Capsule Architecture Analysis
**Applies To**: Tally.ERP 9 (caps/ directory)
**Format**: Compiled TDL Binary (.cap)

---

## 1. Introduction

Capsule files (`.cap`) are the compiled binary units of Tally Definition Language (TDL) in Tally.ERP 9. They reside under the `caps/` subdirectory of the Tally installation root and constitute the entire runtime logic of the product — including UI screens, reports, data-entry forms, business logic, print templates, and import/export routines.

`.cap` files are **not human-readable**. They are the compiled output of TDL source files, analogous in role to Java `.class` files or .NET assemblies. Tally's runtime loader deserialises these binaries into an in-memory object graph that drives all application behaviour.

No corresponding `.tdl` source files ship with the product. Tally.ERP 9 is distributed exclusively via these pre-compiled capsules, making the binary capsule format the sole available artefact for third-party analysis.

---

## 2. Naming Convention

Capsule file names follow the pattern:

```
<module-id>-<sequence-number>.cap
```

| Component | Example | Description |
|-----------|---------|-------------|
| `module-id` | `41084` | Numeric identifier that maps to a functional module or feature area. Likely assigned from an internal registry. |
| `sequence-number` | `00001` | Version or revision number. Higher values indicate newer builds of the same module. |

### Observed Pattern

- The `module-id` space is sparse — observed IDs range from single digits (`3`, `5`, `7`) through five-digit values (`41084`, `51073`).
- IDs do **not** appear to be sequential within a functional grouping; they may originate from a central build system that issues IDs on first registration of a module.
- The `sequence-number` is zero-padded to five digits. Within a given `module-id`, the sequence number increments across releases. For example, an update may ship `41084-00002.cap` while retaining `41084-00001.cap` (or replacing it), suggesting a per-module versioning scheme independent of the product build number.
- Some capsules share the same `module-id` but different `sequence-number` values, confirming sequence numbers denote revisions of the same logical module.

---

## 3. Size Analysis

Capsule file sizes span three broad categories that correlate with functional scope:

### Large Modules (2–4 MB)

- Single largest file: `41084-00001.cap` at ~3.2 MB.
- These represent core engine modules — the TDL runtime, base UI framework, ledger/ voucher engine, and reporting substrate.
- A single large capsule may contain hundreds of interlinked TDL objects (functions, reports, forms, menus).

### Medium Modules (200 KB – 1 MB)

- Typically feature-specific modules: inventory management, payroll, taxation (GST, TDS), banking, and statutory compliance.
- Encapsulate a coherent set of screens, reports, and business logic for one functional domain.
- Often have multiple revision files (e.g., `51073-00001.cap`, `51073-00002.cap`) indicating iterative updates to that feature.

### Small Modules (4 KB – 200 KB)

- Utility, helper, or thin-binding modules.
- Examples include print-engine stubs, import/export adapters, language/localisation packs, and small report definitions.
- Many files in the 8–50 KB range appear to be single-report or single-dialog capsules.

---

## 4. Capsule System Purpose

The capsule architecture serves several engineering goals:

### Modular Loading

Tally loads capsules on demand. At startup, only a minimal bootstrap capsule executes; additional capsules are loaded as the user navigates to specific features. This keeps the initial memory footprint low and defers parsing of unused TDL objects.

### Updates and Patching

Tally.ERP 9 updates ship new `.cap` files into the `caps/` directory without modifying existing files (when sequence numbers increase) or by replacing specific capsules (when sequence numbers stay the same). Because each module has an independent version, a hotfix can target a single functional area without redistributing the entire product.

### Feature Gating

The presence or absence of a capsule can enable or disable features. Tally licenses certain modules (e.g., payroll, GST) separately; the corresponding capsules may be absent from unlicensed installations or conditionally loaded based on licence state. This provides a simple binary gating mechanism at the file-system level.

### Isolation and Side-Effects

Capsules are self-contained. A defect in one module's TDL is less likely to corrupt another module's runtime state because each capsule defines its own object namespace. The runtime loader enforces separation boundaries.

---

## 5. Comparison to TallyPrime .tcp Files

| Aspect | Tally.ERP 9 (.cap) | TallyPrime (.tcp) |
|--------|--------------------|-------------------|
| Format age | Legacy (introduced with Tally.ERP 9 series) | Newer (introduced with TallyPrime) |
| Extension | `.cap` | `.tcp` |
| Internal structure | Compiled TDL binary, proprietary | Compiled TDL binary, different binary layout |
| Human-readable | No | No |
| Decompilable | No known tooling exists | No known tooling exists |
| Location | `caps/` directory | `caps/` directory (same logical location) |
| Distribution model | Shipped with installer or via update | Shipped with installer or via update |
| Backward compatibility | Not directly loadable by TallyPrime | Not loadable by Tally.ERP 9 |

The `.tcp` format introduced with TallyPrime appears to be a revised capsule container — possibly with a different header, checksum, or compression scheme — but serves the identical purpose. Neither format exposes source-level TDL.

---

## 6. What Can Be Inferred

Despite the binary opacity, certain properties of the capsule set yield useful information:

### Capsule ID → Functional Area

Repeated co-occurrence of capsule IDs in the same installation directory, combined with known Tally feature sets, allows plausible grouping:

- Files sharing a `module-id` range often relate to the same feature (e.g., tax-computation IDs cluster together).
- Larger capsules tend to correspond to foundational subsystems. Smaller ones correspond to peripherals or reports.
- New capsules appearing in a later update without a prior revision suggest a newly introduced feature.

### Size → Complexity

A capsule's file size is a rough proxy for the number of TDL objects it contains. A jump in size between revisions of the same module may indicate feature additions. A decrease may indicate refactoring or removal.

### Version Numbering → Update History

- A module with many sequence-number increments has undergone frequent changes.
- Modules whose sequence numbers remain unchanged across product updates are stable or unmaintained.
- The spread of sequence numbers across modules reveals which functional areas received attention in a given release.

### Timestamps → Build Cadence

File modification timestamps on capsules reflect the build date (or installation date). Clusters of capsules with identical or near-identical timestamps suggest they were compiled together in a single build. Outlier timestamps suggest hotfixes or separately compiled modules.

---

## 7. Limitations

The following are **not possible** with `.cap` files alone:

- **Decompilation**: No tool exists that can produce readable TDL from `.cap` binaries. The binary format is undocumented, proprietary, and likely obfuscated.
- **Source recovery**: The original `.tdl` source files are never distributed. There is no embedded source map or debug symbol table.
- **Formula extraction**: Business-logic expressions (e.g., tax calculation formulae, wage computation rules) are baked into compiled bytecode and cannot be reliably recovered.
- **Report definition recovery**: Report layouts, field bindings, and print templates are serialised in binary form and are not extractable as structured data.
- **Reverse-engineering risk**: Attempting to reverse-engineer the capsule format may violate the Tally end-user licence agreement. This document does not encourage or endorse such activity.

---

## 8. Best Practices for Developers

While the `.cap` format resists direct inspection, the following approaches yield valuable intelligence without decompilation:

### Track capsule manifests across versions

Maintain a baseline inventory (filename, size, timestamp, SHA-256 hash) for each Tally installation or update. Diffing manifests across versions reveals:

- New modules (previously unseen `module-id` values).
- Updated modules (same `module-id`, higher `sequence-number`).
- Removed modules (capsules present in the old manifest but absent from the new one).

### Correlate with release notes

Tally release notes describe fixed defects and new features. Cross-reference these with capsule changes to build a mapping between module IDs and feature areas.

### Monitor file-size trends

Plot capsule sizes over successive updates. A sudden size increase in a tax-related capsule may correspond to a new compliance requirement (e.g., a GST rule change).

### Document capsule fingerprints

Build a lookup table of known capsule IDs, their first-seen version, size range, and suspected function. Over time, this table becomes a reference for identifying which parts of the product changed between releases.

### Treat capsules as opaque deployment units

When integrating with Tally (e.g., via the Tally ODBC/XML interface or TallyPrime Web API), capsules are a deployment detail. Business logic should rely on the public API surface, not on assumptions about capsule internals.

---

*End of document.*
