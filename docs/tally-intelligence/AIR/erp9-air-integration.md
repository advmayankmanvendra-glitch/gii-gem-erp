# Tally.ERP 9 — AIR Integration Document

**Phase I — Tally Intelligence Layer**
**Document Owner**: Accounting Intelligence Repository (AIR)
**Status**: Draft for Review
**Applies To**: AIR v2 (TallyPrime v1.1.7) → AIR v3 (ERP9 + Prime dual-source)

> **GGR-1 registry clarification (2026-08-21):** This document is a draft Tally implementation-mapping proposal, not the live Enterprise Intelligence Layer registry. Its proposed AG-1/RG-2/TG-1/MG-1 identifiers must not be treated as current graph registrations. Live AG-1 is the Audit Intelligence Graph; RG-2 remains UNVERIFIED. Rule 31 defines AIR as software-independent accounting knowledge, while Tally assets are implementation references.

---

## 1. AIR v2 Architecture Overview

`air-v2` is the Tally-specific implementation-mapping asset within the Accounting Intelligence Repository (AIR). It maps Tally accounting entities to the GII ERP schema and lives at `src/renderer/knowledge/tally/tallyKnowledgeRepository.json` (schemaVersion 2.0, graphId `air-v2`). Under Permanent Architecture Rule 31, AIR's accounting concepts derive from authoritative accounting standards and regulations; Tally is an implementation reference, not the accounting authority.

### 1.1 Seven Core Entity Types

AIR v2 covers seven primary entity types extracted from TallyPrime:

| Entity Type | GII Module | Risk Level | Fields Mapped |
|---|---|---|---|
| GROUP | Master | P0 | 10 fields |
| LEDGER | Accounting | P0 | 36 fields |
| VOUCHER | Transactions | P0 | 17 fields |
| STOCKITEM | Inventory | P0 | 19 fields |
| STOCKGROUP | Inventory | P1 | 8 fields |
| UNIT | Inventory | P2 | 6 fields |
| VOUCHERTYPE | Configuration | P1 | 10 fields |

Three additional entity types (COSTCENTRE, GODOWN, COSTCATEGORY) have partial mapping and are listed under `unmappedEntityTypes`. Eleven more Tally entity types (TAXJURISDICTION, DUTYHEAD, EMPLOYEE, PAYHEAD, CURRENCY, etc.) are identified but not yet mapped.

### 1.2 A/B/C Field Classification

Every field in every entity carries a classification:

- **A (Critical)**: Must be mapped for accurate migration. Missing A fields break financial statements, GST compliance, or inventory valuation. Examples: `NAME`, `PARENT`, `OPENINGBALANCE`, `GSTIN`, `DATE`, `BASEUNITS`.
- **B (Useful)**: Enhances ERP functionality. Migrate if available; fallback to defaults acceptable. Examples: `ISBILLWISEON`, `MAILINGNAME`, `STARTINGFROM`, `TAXTYPE`.
- **C (Ignore)**: Internal Tally behaviour — no migration needed. Examples: `SORTPOSITION`, `OBJECTUPDATEACTION`, `ISPERISHABLEON`, `LANGUAGEID`.

Classification is defined in `metadata.fieldClassification` and per-field via `classification` inside each entity's `fieldMapping`.

### 1.3 Conceptual Intelligence Chain

AIR v2 introduced a full-chain conceptual intelligence model for pattern entities (LEDGER, VOUCHER). The chain links eight layers:

```
Tally Concept
  → ERP Workflow (creation path, screens, business processes, lifecycle events)
  → ERP Database (primary table, related tables, key fields with source/type/classification)
  → Accounting Impact (debit/credit nature, financial statement effects, journal entry structure)
  → Inventory Impact (quantity/valuation effects, conditions, valuation methods)
  → GST Impact (tax types, return mapping, e-invoice/e-way-bill relevance)
  → Reports (primary, financial, regulatory, operational, dashboard widgets)
  → AI Explanation (simple definition, business context, common questions, impact explanation, Help Assistant integration)
```

LEDGER and VOUCHER have full intelligence chains. GROUP has a partial chain (missing `database` section). STOCKITEM, STOCKGROUP, UNIT, VOUCHERTYPE, COSTCENTRE, and GODOWN have entity-to-table mapping only — their intelligence chains are pending.

### 1.4 Mapping Entries

Each entity's `fieldMapping` maps a Tally XML field name to:
- `giiField`: The GII ERP schema field name
- `target`: The GII master table name
- `type`: Data type (string, number, boolean, date, reference, textarea)
- `required`: Whether the field is mandatory in the GII schema
- `classification`: A/B/C

Reference fields (e.g., `PARENT` on LEDGER → `group_id`) are typed as `reference` and validated via `validationRules.missingParentGroupRefs`.

---

## 2. Current State

### 2.1 Extraction Source

The AIR was generated from a live TallyPrime v1.1.7 company: **GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED** (GSTIN: 10AAJCG3823D1Z7, State: Bihar). The extraction ran against `C:\Program Files\TallyPrime` with ODBC on port 9000.

### 2.2 Entity Counts

| Metric | Count |
|---|---|
| Total entities extracted | 1,617 |
| Mapped entities (to GII schema) | 1,604 |
| Voucher instances with full chain | 85 |
| Voucher types enumerated | 20 |
| Reserved pre-defined groups | 28 |
| UQC codes | 21 |
| Unmapped entity types identified | 11 |

### 2.3 Validation Rules

The AIR defines cross-entity validation through `validationRules.missingParentGroupRefs`:

| Entity | Parent Field | References | Risk |
|---|---|---|---|
| GROUP | PARENT | GROUP | P0 |
| LEDGER | PARENT | GROUP | P0 |
| STOCKITEM | PARENT | STOCKGROUP | P1 |
| STOCKGROUP | PARENT | STOCKGROUP | P1 |
| GODOWN | PARENT | GODOWN | P2 |
| COSTCENTRE | PARENT | COSTCENTRE | P2 |

### 2.4 Parent Reference Resolution Rules

Parent references follow Tally's hierarchical rules:
- A GROUP can be a child of another GROUP (max depth: unlimited, but practically 3-4 levels).
- A LEDGER must reference a valid GROUP (never another LEDGER).
- A STOCKITEM can reference a STOCKGROUP (optional).
- A STOCKGROUP can be a child of another STOCKGROUP.
- A GODOWN can be a child of another GODOWN.
- A COSTCENTRE can be a child of another COSTCENTRE or COSTCATEGORY.

### 2.5 High-Risk Field Definitions

`validationRules.highRiskFields` identifies fields whose incorrect mapping causes irreversible data corruption:

- **LEDGER**: `OPENINGBALANCE`, `OBSTATUS` — wrong values break trial balance and opening sheet.
- **VOUCHER**: `ALLLEDGERENTRIES.LIST`, `ALLINVENTORYENTRIES.LIST`, `BILLALLOCATIONS.LIST`, `VOUCHERTAXENTRIES.LIST` — these are complex nested lists; incorrect mapping produces unbalanced transactions.
- **STOCKITEM**: `OPENINGBALANCE`, `OPENINGVALUE`, `RATEOFDUTY` — wrong values corrupt stock valuation.
- **GROUP**: `ISDEEMEDPOSITIVE`, `AFFECTSGROSSPROFIT` — incorrect values misclassify P&L lines.

### 2.6 UQC Codes

21 Unified Quantity Codes are mapped from Tally's internal unit names to GST-standard UQC codes. Example mappings: `PCS→NOS`, `KGS→KGS`, `MTR→MTR`, `BOX→BXS`, `DOC→DOZ`. Each entry stores the source name, the canonical UQC code, a description, and the GST portal UQC code.

---

## 3. ERP9 Integration Points

### 3.1 Version-Agnostic Entity Structure

AIR v2's seven entity types (GROUP, LEDGER, VOUCHER, STOCKITEM, STOCKGROUP, UNIT, VOUCHERTYPE) exist identically in both Tally.ERP 9 and TallyPrime. The field mapping definitions are version-agnostic — the XML export structures, ODBC table schemas, and TDL object names are consistent across versions.

This means the current AIR v2 JSON can serve as a valid knowledge base for ERP 9 migrations without structural changes. The same `fieldMapping` entries, `requiredFields`, `reservedGroupMapping`, and `voucherTypeMapping` apply.

### 3.2 Version Metadata Addition

To formally track provenance, each entity mapping should carry version metadata:

```json
"versionCompatibility": {
  "erp9": { "supported": true, "lastVerified": "2025-11-19", "notes": "Identical XML tags" },
  "prime": { "supported": true, "lastVerified": "2026-07-01", "notes": "Source of AIR v2 extraction" }
}
```

This metadata enables the migration engine to:
- Warn when a field exists only in one version.
- Select the correct extraction strategy per source.
- Route version-specific validation rules.

### 3.3 Field Mapping Differences: ERP9 vs Prime

Based on the version comparison analysis (`docs/tally-intelligence/VersionComparison/erp9-vs-prime-comparison.md`), the following differences affect field mapping:

| Area | Tally.ERP 9 | TallyPrime | AIR Impact |
|---|---|---|---|
| GST fields | `GSTREGISTRATIONTYPE`, `GSTIN`, `PLACEOFSUPPLY` exist | Same fields + `GSTTYPEOFSUPPLY`, `GSTNATUREOFSUPPLY` | Prime-only fields should be marked `versionCompatibility: { prime: true }` |
| E-Invoice fields | Not present | `EINVOICEIRN`, `EINVOICESTATUS` | New fields needed in VOUCHER and LEDGER |
| E-Way Bill fields | Basic `EWAYBILLNO` | Additional `EWAYBILLVALIDFROM`, `EWAYBILLVALIDTO` | Prime-specific enrichment |
| Multi-GSTIN | Single GSTIN per ledger | Multiple GSTIN per party (branch-wise) | Collection field needed |
| TDS/TCS | Limited sections (194A, 194C, etc.) | Expanded sections + auto-calculation | Classification A in Prime, B in ERP9 |
| UQC format | Internal unit codes (PCS, NOS, etc.) | Same internal codes + GST UQC mapping | Both versions use same uqcMap |

In practice, the core ~80% of fields are identical. The delta is concentrated in compliance features added between ERP 9's last release (v6.6.3) and Prime's ongoing releases.

### 3.4 Entity Extraction Overlap

The `tallyKnowledgeRepository.json` extraction corresponds to TallyPrime v1.1.7. A parallel extraction from Tally.ERP 9 v6.6.3 using the same company data would produce a comparable entity set with these expected differences:

| Entity | Expected Count (ERP9) | Notes |
|---|---|---|
| GROUPS | 28+ (same) | Pre-defined groups identical |
| LEDGERS | 1,600+ (comparable) | Same company, same ledgers |
| VOUCHERS | 85+ (comparable) | Same transaction set |
| STOCKITEMS | Same | Inventory identical |
| UQC codes | 21 (same) | Unit codes hard-coded in both |

### 3.5 ODBC Schema Compatibility

Both versions expose ODBC on port 9000 by default. The table schemas (`Groups`, `Ledger`, `StockItem`, `Voucher`, etc.) are structurally identical. Key differences:

- Tally.ERP 9 ODBC exposes fewer columns in `Voucher` (no `EInvoiceIRN`, no `E-way Bill` extended fields).
- Tally.ERP 9 `Ledger` table lacks `GSTTYPEOFSUPPLY` and `GSTNATUREOFSUPPLY`.
- Tally.ERP 9 ODBC returns uppercase column names; TallyPrime preserves camelCase in some views.

---

## 4. Proposed AIR v3 Extensions

### 4.1 versionCompatibility Field

Every entity mapping entry should gain a `versionCompatibility` block:

```json
"GSTTYPEOFSUPPLY": {
  "giiField": "gst_type_of_supply",
  "target": "Ledger Master",
  "type": "string",
  "required": false,
  "classification": "B",
  "versionCompatibility": {
    "erp9": { "supported": false, "reason": "Introduced in TallyPrime" },
    "prime": { "supported": true, "lastVerified": "2026-07-01" }
  }
}
```

For the field at the entity level:
```json
"versionCompatibility": {
  "erp9": { "supported": true, "fieldsAtRisk": ["GSTTYPEOFSUPPLY", "GSTNATUREOFSUPPLY"] },
  "prime": { "supported": true }
}
```

### 4.2 Feature Flags

A new top-level section `featureFlags` would declare version-specific capabilities:

```json
"featureFlags": {
  "erp9": {
    "version": "6.6.3",
    "gst": { "eInvoice": false, "eWayBillExtended": false, "multiGSTIN": false },
    "tds": { "autoCalculation": false, "expandedSections": false },
    "inventory": { "batchTracking": true, "godownTracking": true },
    "reporting": { "comparativeReports": true, "ratioAnalysis": false },
    "api": { "odbc": true, "tdl": true, "xmlExport": true, "xmlImport": true }
  },
  "prime": {
    "version": "1.1.7",
    "gst": { "eInvoice": true, "eWayBillExtended": true, "multiGSTIN": true },
    "tds": { "autoCalculation": true, "expandedSections": true },
    "inventory": { "batchTracking": true, "godownTracking": true },
    "reporting": { "comparativeReports": true, "ratioAnalysis": true },
    "api": { "odbc": true, "tdl": true, "xmlExport": true, "xmlImport": true }
  }
}
```

The migration engine checks `featureFlags` before:
- Attempting to extract e-invoice data from an ERP9 source.
- Mapping compliance fields that don't exist in the source.
- Generating GST return data from a version that lacks specific computations.

### 4.3 Migration Intelligence Nodes

A new `migrationIntelligence` section would document what changes when moving data between versions:

```json
"migrationIntelligence": {
  "erp9ToPrime": {
    "fieldTransforms": [
      {
        "entity": "LEDGER",
        "field": "GSTTYPEOFSUPPLY",
        "action": "add",
        "defaultValue": "Goods",
        "postMigrationRequired": true,
        "description": "Prime requires GST Type of Supply for all ledgers; ERP9 does not store this field"
      },
      {
        "entity": "VOUCHER",
        "field": "EINVOICESTATUS",
        "action": "add",
        "defaultValue": null,
        "postMigrationRequired": false,
        "description": "Prime can generate e-invoices; ERP9 vouchers have no IRN. Set to null after migration"
      }
    ],
    "schemaChanges": [
      {
        "entity": "VOUCHER",
        "change": "ADD_COLUMN",
        "field": "e_invoice_irn",
        "impact": "Non-breaking; existing ERP9 vouchers will have null IRN"
      }
    ],
    "behaviourChanges": [
      {
        "area": "GST Calculation",
        "erp9Behaviour": "Manual GST classification per ledger",
        "primeBehaviour": "Auto-classification based on HSN/SAC + GST Type of Supply",
        "migrationAction": "Recompute GST classification for all existing vouchers after upload"
      }
    ]
  },
  "primeToGii": {
    "fieldTransforms": [
      {
        "entity": "GROUP",
        "field": "PARENT",
        "action": "resolve",
        "resolution": "Map Tally pre-defined group names to GII group IDs via reservedGroupMapping"
      }
    ]
  }
}
```

### 4.4 Report Hierarchy Mapping

AIR v3 should include a `reportMapping` section that links Tally report IDs to GII ERP report IDs:

```json
"reportMapping": {
  "erp9": {
    "Trial Balance": { "giiReportId": "trial-balance", "primeEquivalent": "Trial Balance" },
    "Balance Sheet": { "giiReportId": "balance-sheet", "primeEquivalent": "Balance Sheet" },
    "Profit & Loss A/c": { "giiReportId": "profit-loss", "primeEquivalent": "Profit & Loss A/c" },
    "Day Book": { "giiReportId": "day-book", "primeEquivalent": "Day Book" },
    "Stock Summary": { "giiReportId": "stock-summary", "primeEquivalent": "Stock Summary" },
    "GST Returns": { "giiReportId": "gst-returns", "primeEquivalent": "GST Reports" },
    "Outstanding": { "giiReportId": "outstanding", "primeEquivalent": "Outstanding Report" },
    "Ratio Analysis": { "giiReportId": null, "primeEquivalent": "Ratio Analysis", "notes": "ERP9 had basic ratios; Prime expanded" }
  },
  "prime": {
    "Dashboard": { "giiReportId": "dashboard", "notes": "New in Prime — no ERP9 equivalent" },
    "E-Invoice Dashboard": { "giiReportId": "e-invoice", "notes": "Prime-only" }
  }
}
```

### 4.5 ODBC Schema Mapping

A new `odbcSchema` section maps Tally ODBC table/column names to GII ERP schema:

```json
"odbcSchema": {
  "tallyErp9": {
    "connectionString": "DSN=TallyODBC9000;SERVER=localhost;DRIVER={Tally ODBC Driver}",
    "tables": {
      "Groups": { "giiTable": "account_groups", "keyMapping": { "Name": "group_name", "Parent": "parent_group_id" } },
      "Ledger": { "giiTable": "ledgers", "keyMapping": { "Name": "ledger_name", "Parent": "group_id", "OpeningBalance": "opening_balance" } },
      "StockItem": { "giiTable": "stock_items", "keyMapping": { "Name": "item_name", "BaseUnits": "base_uom" } },
      "Voucher": { "giiTable": "vouchers", "keyMapping": { "VoucherNumber": "voucher_number", "Date": "voucher_date" } },
      "VoucherType": { "giiTable": "voucher_types", "keyMapping": { "Name": "voucher_type_name" } },
      "Unit": { "giiTable": "uom", "keyMapping": { "Name": "uom_name" } }
    }
  },
  "tallyPrime": {
    "connectionString": "DSN=TallyPrimeODBC;SERVER=localhost;DRIVER={Tally ODBC Driver}",
    "tables": {
      "Groups": { "giiTable": "account_groups", "keyMapping": { "Name": "group_name" } },
      "Ledger": { "giiTable": "ledgers", "keyMapping": { "Name": "ledger_name" } },
      "StockItem": { "giiTable": "stock_items" },
      "Voucher": { "giiTable": "vouchers" },
      "VoucherType": { "giiTable": "voucher_types" },
      "Unit": { "giiTable": "uom" },
      "CostCentre": { "giiTable": "cost_centres" },
      "Godown": { "giiTable": "godowns" }
    },
    "columnDifferences": {
      "Ledger": {
        "primeOnly": ["GstTypeOfSupply", "GstNatureOfSupply", "EInvoiceApplicable"],
        "erp9Only": []
      },
      "Voucher": {
        "primeOnly": ["EInvoiceIRN", "EInvoiceStatus", "EWayBillValidFrom", "EWayBillValidTo"],
        "erp9Only": []
      }
    }
  }
}
```

---

## 5. Knowledge Graph Evolution

The AIR is the foundational graph in a family of interconnected intelligence graphs that together form the Enterprise Intelligence Layer.

### 5.1 TG-1 (Tally Graph) — Current Mapping Intelligence

- **Status**: Active (AIR v2)
- **Scope**: Maps Tally entity definitions, field mappings, validation rules, and conceptual intelligence chains from Tally to GII ERP.
- **Consumers**: Migration engine, entity resolution pipeline, field mapping service, Help Assistant.
- **Future**: TG-1 will absorb the `versionCompatibility`, `featureFlags`, and `migrationIntelligence` sections proposed for AIR v3.

### 5.2 AG-1 (Accounting Graph) — Universal Accounting Relationships

- **Status**: Design phase
- **Scope**: Universal accounting truths that transcend any specific ERP. Defines debit/credit mechanics, financial statement structure, double-entry axioms, period-end closure rules, and reporting standards (GAAP, IFRS, IND AS).
- **Dependencies**: TG-1 (AIR) for Tally-specific mappings, Universal Accounting Concepts document for canonical definitions.
- **Relation to AIR**: AG-1 is the abstract layer above AIR. While AIR says "LEDGER.PARENT maps to group_id", AG-1 says "every account belongs to exactly one classification category, and that category determines its position in financial statements."
- **Target completion**: AIR v3 phase.

### 5.3 MG-1 (Migration Graph) — ERP9 → Prime → GII ERP Migration Paths

- **Status**: Proposed for AIR v3
- **Scope**: Documents every possible migration path with field-level transformations, compatibility matrices, risk assessments, and rollback procedures.
- **Path types**:
  - ERP9 → GII ERP (direct migration)
  - ERP9 → Prime → GII ERP (two-stage migration)
  - Prime → GII ERP (direct migration)
  - ERP9 → Prime (version upgrade, no GII)
- **Nodes**: Source version, target version, entity type, field name, transformation function, risk level, rollback query.
- **Edges**: dependency constraints (e.g., GROUP must migrate before LEDGER).
- **Integration with AIR**: MG-1 references AIR field mappings and validation rules. The `migrationIntelligence` section in AIR v3 seeds MG-1.

### 5.4 WG-1 (Workflow Graph) — Business Process Workflows

- **Status**: Proposed
- **Scope**: Maps end-to-end business processes (e.g., Procure-to-Pay, Order-to-Cash, Record-to-Report) across ERP systems. Each node is a business step; each edge is a transition with preconditions and post-conditions.
- **Dependencies**: TG-1, AG-1.
- **Example**: Procure-to-Pay: Purchase Requisition → Purchase Order → Goods Receipt → Purchase Voucher → Payment → Reconciliation. Each step references AIR entity types (VOUCHER, LEDGER, STOCKITEM) and AG-1 accounting effects.
- **Target completion**: Post-AIR v3.

### 5.5 RG-2 (Renderer Graph) — Next-Gen Renderer Intelligence

- **Status**: Reference in `tallyKnowledgeRepository.json` `dependencies` as `rg-1`.
- **Scope**: Maps Tally screen definitions (UI layouts, field positions, validation rules) to GII ERP renderer components. Enables the Help Assistant to guide users by referencing Tally screen names they recognise.
- **Dependencies**: TG-1 (AIR) for field-to-screen mapping.
- **Relation to AIR**: AIR's `workflow.involvedScreens` lists the Tally screen names for each entity. RG-2 resolves those screen names into GII route paths, component names, and field coordinates.

### 5.6 Graph Dependency Chain

```
AG-1 (Universal Accounting)
  └── TG-1 / AIR (Tally-Specific Mapping)
        ├── MG-1 (Migration Paths)
        ├── WG-1 (Workflow Processes)
        └── RG-2 (Renderer Intelligence)
```

The chain above is a historical proposal inside this draft and is not the live registry. `repository/graph-registry.json` version 1.4.0 currently contains nine ACTIVE primary graphs. The proposed AIR/TG-1/MG-1 identifiers are unregistered, live AG-1 means Audit Intelligence Graph, and RG-2 remains UNVERIFIED pending separate owner approval.

---

## 6. AIR Maintenance Guide

### 6.1 Adding New Entities

To add a new entity type to the AIR:

1. **Identify the entity** in Tally's XML export or ODBC schema. Confirm it is not already in `unmappedEntityTypes`.
2. **Extract field list** from Tally XML export of a real company or from TDL object definitions in `C:\Program Files\Tally\Tally.ERP9\` capsules.
3. **Classify each field**:
   - A: Required for GII ERP functionality or financial integrity.
   - B: Enhances functionality; safe to default.
   - C: Tally-internal metadata; do not map.
4. **Add entity block** to `entityTypes` following the pattern of existing types. Include at minimum: `giiModule`, `risk`, `fieldMapping`, `requiredFields`.
5. **Add conceptual intelligence**: At minimum `concept` and `workflow`. Full-chain intelligence (database, accountingImpact, inventoryImpact, gstImpact, reports, aiExplanation) is required for P0 entities (GROUP, LEDGER, VOUCHER, STOCKITEM) and recommended for all others.
6. **Update `metadata.entityTypesCovered`** array.
7. **Add parent reference rules** to `validationRules.missingParentGroupRefs` if the entity references another.
8. **Add high-risk field entries** in `validationRules.highRiskFields` if applicable.
9. **Bump `schemaVersion`** to the next minor version (e.g., 2.1).

### 6.2 Updating Field Classifications

Field classifications may change as GII ERP evolves:

- **A → B**: If GII ERP introduces a sensible default for a previously required field.
- **B → A**: If a field becomes critical due to new compliance requirements (e.g., a new GST field).
- **C → B**: If a Tally-internal field becomes useful for AI reasoning or audit trail.

Update process: Change the `classification` value in the relevant `fieldMapping` entry. Add a `classificationHistory` entry:

```json
"classificationHistory": [
  { "version": "2.0", "classification": "C", "reason": "Initial mapping" },
  { "version": "2.1", "classification": "B", "reason": "GST audit requires e-way bill extended fields" }
]
```

### 6.3 Version Compatibility Tracking

When a field or entity exists in only one Tally version:

1. Add `versionCompatibility` block to the field's `fieldMapping` entry.
2. If the entire entity is version-specific, add `versionCompatibility` at the entity level.
3. Update `featureFlags` if the entity affects version-specific capabilities.
4. Add migration intelligence in `migrationIntelligence` if the field requires transformation during cross-version migration.

### 6.4 Cross-Reference Integrity

The AIR is referenced by multiple downstream consumers. Before committing changes:

1. **Check `validationRules.missingParentGroupRefs`**: Every entity with a `PARENT` reference field must have an entry here.
2. **Check `reservedGroupMapping`**: Every pre-defined group name in Tally must have a mapping if referenced by LEDGER's PARENT validation.
3. **Check `voucherTypeMapping`**: Every voucher type referenced by VOUCHER's `VOUCHERTYPENAME` must have a mapping.
4. **Check graph dependencies**: If a field name changes, update `rg-1` screen mappings and `mg-1` migration rules.
5. **Run validation audit**: Execute `scripts/verify-audit.js` (or its equivalent) to verify AIR cross-reference integrity.

---

## 7. Q&A with GII ERP

### 7.1 How Does AIR Drive GII ERP Decisions?

The AIR is consulted during every major GII ERP decision that involves Tally data:

| Decision | AIR Role |
|---|---|
| Entity creation wizard | AIR provides required fields, classifications, and default values per entity type |
| Data import / migration | AIR maps Tally XML fields to GII schema; validates required fields; applies default for missing B/C fields |
| GST return generation | AIR identifies GST-relevant fields per entity; maps Tally GST classifications to GII tax structures |
| Report generation | AIR maps Tally report IDs to GII report IDs; identifies which entities affect which reports |
| AI assistance (Help Assistant) | AIR provides `aiExplanation` blocks — simple definitions, business context, common questions, impact explanations |
| Field-level validation | AIR supplies per-field type, required status, classification, and cross-entity reference rules |
| Feature toggling | AIR's `featureFlags` tell the UI whether a feature is available for the source version |

### 7.2 Entity Resolution Pipeline

When the system encounters a Tally entity (e.g., a Ledger from an XML import file), the resolution pipeline is:

```
1. Parse Tally XML → Extract entity type + field values
2. Lookup entity in TG-1 (AIR) → Get field mapping, classification, validation rules
3. Resolve parent references → Map Tally parent names to GII IDs (using reservedGroupMapping or lookup)
4. Apply version compatibility → Skip fields not present in source version; apply transforms from migrationIntelligence
5. Validate required fields → Reject if any A-classification field is missing (or apply default)
6. Validate data types → Type cast per mapping (string, number, date, boolean)
7. Classify fields → A fields go to main table; B fields go to extended attributes; C fields are discarded
8. Generate GII entity → Write to target GII tables per entity's database mapping
9. Log resolution → Record source field, target field, transform applied, warnings for missing optional data
```

### 7.3 Field Mapping Priority

When a Tally field maps to multiple possible GII fields (or vice versa), priority follows:

```
1. A-classification fields with versionCompatibility matching the source → Mandatory, always map
2. A-classification fields without versionCompatibility restrictions → Mandatory, always map
3. B-classification fields → Map if present in source; skip if missing (log warning)
4. C-classification fields → Never map (discard)
```

Conflicts are resolved by rule:
- **Direct mapping** (same name/semantics): highest priority
- **Computed mapping** (requires transformation): second priority
- **Default mapping** (field not present → apply default): lowest priority among applicable

If a source field maps to multiple GII targets (e.g., Tally `NAME` → GII `ledger_name` and `display_name`), the pipeline creates both with the same value. If multiple source fields map to the same GII target, the highest-classification source wins.

---

## Appendix A: AIR v3 Schema Contract

Any future AIR v3 graph registration would require a separate approved programme, a conflict-free graph identifier and the standard registry/schema/verification gates. The following block is a proposal only and is not a live registry record:

```json
{
  "graphId": "air-v3",
  "name": "Accounting Intelligence Repository",
  "version": "3.0",
  "dependencies": ["kg-1", "universal-accounting-concepts"],
  "provides": ["entity-mapping", "field-classification", "version-compatibility", "migration-intelligence", "report-mapping", "odbc-schema"],
  "compatibility": {
    "breakingChanges": ["versionCompatibility blocks required for all fields"],
    "additiveChanges": ["featureFlags", "migrationIntelligence", "reportMapping", "odbcSchema"]
  },
  "validationAudit": "scripts/verify-audit.js"
}
```

## Appendix B: Verification Checklist for ERP9 Integration

Before marking ERP9 integration as complete:

- [ ] All 7 entity types confirmed identical between ERP9 and Prime
- [ ] versionCompatibility metadata added to entity-level blocks
- [ ] featureFlags defined for ERP9 and Prime
- [ ] migrationIntelligence section populated with ERP9→Prime transforms
- [ ] reportMapping populated with ERP9 report IDs
- [ ] odbcSchema populated for ERP9 ODBC tables
- [ ] Cross-reference integrity verified (no broken parent refs)
- [ ] Unmapped entity types reviewed for ERP9-specific additions
- [ ] graph-registry.json updated with AIR v3 entry
- [ ] verify-audit.js updated for new sections
- [ ] All entity field mappings reviewed for ERP9-specific deviations
