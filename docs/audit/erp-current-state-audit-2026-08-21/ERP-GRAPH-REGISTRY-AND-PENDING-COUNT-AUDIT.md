# Gesture India Infrastructure (GII) Government e-Marketplace (GeM) Enterprise Resource Planning (ERP) Graph Registry and Pending Count Audit

**System:** Gesture India Infrastructure (GII) Government e-Marketplace (GeM) Enterprise Resource Planning (ERP)

**Registry:** `repository/graph-registry.json` version 1.3.0

**Evidence commit:** `8ce3a42849c68398207a3b9cd8737d57f015215e`

**Result:** **PASS WITH WARNINGS**

**Graph identifier key:** Knowledge Graph (KG), Renderer Graph (RG), Database Graph (DG), Workflow Graph (WG), Feature Function Graph (FF) and Audit Graph (AG). BRAIN identifiers denote ERP knowledge and assistant stages.

## 1. Count definitions

- **Primary registered graph:** a record in the live registry's `graphs[]` array.
- **Registry Pending Count:** a primary record whose status is Planned, Pending or In Progress.
- **Effective Pending Graph:** an Active primary graph whose own artefact contains at least one material, explicitly unimplemented roadmap obligation.
- **Historical-only identifier:** a roadmap stage recorded outside `graphs[]`; it may be Completed, Merged, Superseded, Deferred or Unverified.
- **Runtime-connected:** application source imports or loads the asset, not merely a verifier or architecture script.

These definitions prevent an Active descriptive graph from being mistaken for a fully runtime-enforced capability.

## 2. Headline counts

| Measure | Count |
|---|---:|
| Primary registry records | 9 |
| Active primary records | 9 |
| Registry Pending Count | **0** |
| Effective Pending Count | **6** |
| Runtime-connected graph/repository assets | 6 |
| Registered but not application-runtime-connected | 3 |
| Historical-stage records | 16 |
| Unique identifiers across primary and historical sections | 24 |
| Historical-only/unregistered identifiers | 15 |
| Primary duplicate identifiers | 0 |
| Cross-section duplicate/conflict | 1 — KG-5 |
| Registered graphs missing schema or location | 0 |
| Unverified/orphan roadmap identifier | 1 — RG-2 |
| Raw pending deliverable statements in Active graph artefacts | 34 |
| Explicitly named pending/deferred phase identifiers | 16 |

## 3. Primary graph register

| Graph | Version in registry record | Status | Runtime-connected | Effective pending | Current evidence and remaining obligation |
|---|---:|---|---|---|---|
| BRAIN-1 | 1.0.0 | Active | Yes | No | Repository and search index active; fresh count 224, but registry says 214 |
| KG-1 | 1.0.0 | Active | No application importer found | No | 167 metadata entries validate; external architecture tools can still consume it |
| RG-1 | 2.0 | Active | Yes | No | 252 files; metadata/version/count drift exists but no explicit implementation roadmap obligation |
| DG-1 | 1.1.0 | Active | Yes | Yes | 73 tables and 32/32 verification; four future extensions and seven recorded gaps |
| WG-1 | 1.0.0 | Active | Yes through graph loader; engine not live-enforced | Yes | 18 stages and 21/21 verification; six runtime/enforcement extensions |
| KG-4 | 1.0.0 | Active | Yes | Yes | Voucher/accounting graph validates; 12 future extensions and six known gaps |
| FF-1 | 1.0.0 | Active | Yes | Yes | 50 features, 15 functions and 31/31 verification; two genuine future obligations after removing stale FF-2 text |
| AG-1 | 1.0.0 | Active | No | Yes | 97 events and 27/27 verification; six runtime/correlation extensions |
| KG-5 | 1.0.0 | Active | No | Yes | 10 manuals, 75 sections, 223 references and 30/30 verification; three planned features plus runtime wiring |

## 4. Runtime consumption

The application currently consumes:

- BRAIN-1 through the ERP Brain repository loader and source-backed search index.
- RG-1, DG-1, WG-1 and KG-4 through `src/renderer/modules/erpBrain/loaders/graphLoader.js`.
- FF-1 through `src/renderer/modules/erpAssistant/sources/featureFunctionBridge.js`.

No application runtime import was found for:

- KG-1 metadata registry.
- AG-1 `audit-graph.json`.
- KG-5 `manual-graph.json`.

The current Help Assistant loads manual content directly from `manualIndex.js` and `manualLoader.js`. KG-5 is therefore implemented and verified as an architecture asset, but its graph relationships are not yet used to answer live help queries.

## 5. Roadmap classification for all 24 unique identifiers

Exactly one recommended current status is assigned to each identifier.

| Identifier | Recommended status | Successor or current meaning |
|---|---|---|
| BRAIN-1 | ACTIVE | ERP knowledge repository |
| BRAIN-2 | COMPLETED | Source-backed ERP Brain service layer |
| BRAIN-3 | COMPLETED | Contextual Help Assistant over BRAIN-2 |
| BRAIN-4 | COMPLETED | Read-only Ask ERP Brain runtime assistant |
| BRAIN-5 | DEFERRED | Large Language Model gateway feasibility/programme |
| KG-1 | ACTIVE | Metadata registry |
| KG-2 | MERGED | Successor WG-1 |
| KG-3 | SUPERSEDED | Successor DG-1 |
| KG-4 | ACTIVE | Voucher and accounting graph |
| KG-5 | ACTIVE | Document and manual graph; stale Planned row must be corrected |
| KG-6 | MERGED | Successor RG-1 |
| KG-7 | SUPERSEDED | Successor AG-1 |
| KG-8 | MERGED | Successor BRAIN-2 search index |
| KG-9 | MERGED | Successor BRAIN-3 contextual mapping |
| KG-10 | MERGED | Successor AG-1/governed validation |
| RG-1 | ACTIVE | Renderer intelligence graph |
| RG-2 | UNVERIFIED | Stray reference only; no implementation evidence |
| DG-1 | ACTIVE | Database intelligence graph |
| WG-1 | ACTIVE | Workflow intelligence graph |
| WG-2 | COMPLETED | Workflow enforcement readiness audit |
| WG-3 | COMPLETED | Warning-only workflow enforcement foundation family |
| FF-1 | ACTIVE | Feature-function correlation graph |
| FF-2 | COMPLETED | Runtime routing absorbed into BRAIN-4.3B using FF-1 |
| AG-1 | ACTIVE | Audit intelligence graph |

Status totals:

| Status | Count |
|---|---:|
| ACTIVE | 9 |
| COMPLETED | 6 |
| MERGED | 5 |
| SUPERSEDED | 2 |
| DEFERRED | 1 |
| UNVERIFIED | 1 |
| PLANNED | 0 |
| RETIRED | 0 |
| Total | 24 |

## 6. Effective pending obligations

The six effective-pending graphs contain 34 raw deliverable statements:

| Graph | Raw future deliverables | Main themes |
|---|---:|---|
| DG-1 | 4 | Column integrity, index analysis, trigger/view mapping and automatic schema generation |
| WG-1 | 6 | Runtime help consumption, workflow guidance/enforcement, future lifecycle families, acceptance skip rules, closure lock and parent visibility |
| KG-4 | 12 | Cash/Bank Book builder, inventory accounting/reversal, financial-year filters, settlement, multi-currency and tax automation |
| FF-1 | 2 genuine | Additional service-contract coverage and AG-1 audit-intent routing |
| AG-1 | 6 | Live event mapping, anomaly detection, cross-graph lineage, tamper evidence, attribution and proposal mirroring |
| KG-5 | 4 | Three planned graph improvements plus a separate runtime-consumption phase |
| Total | 34 | Statements overlap with named future phases |

The 16 explicitly named pending/deferred phase identifiers are:

- BRAIN-3.5.
- BRAIN-5B, BRAIN-5C, BRAIN-5D, BRAIN-5E and BRAIN-5F.
- DG-1.1, DG-1.2, DG-1.3 and DG-1.4.
- WG-3B, WG-3C, WG-3D, WG-3E and WG-3F.
- AG-2.

The 34 statements and 16 named phases must not be added together; several phases implement multiple statements.

## 7. Registry and graph conflicts

### HIGH

1. **KG-5 duplicate status:** primary record is Active, while `historicalStages` says Planned. The human-readable registry repeats the conflict.
2. **Dependency reciprocity:** 12 `dependedBy` reverse edges are missing. KG-4, FF-1 and KG-5 consumers are the main omissions.
3. **Verifier coverage:** unified verification checks target existence but does not validate historical status consistency, count accuracy, semantic version equivalence or reverse-edge symmetry.

### MEDIUM

4. **BRAIN-1 count:** registry 214; fresh verification 224: 17 modules, 6 workflows, 31 reports, 30 screens, 40 rules, 50 glossary entries, 20 navigation entries and 30 errors.
5. **RG-1 version:** compatibility matrix says 2.0.0; registry record and graph artefact say 2.0.
6. **RG-1 graph count:** generator and generated artefact still describe eight Active graphs; registry now has nine.
7. **FF-1 future text:** one line says FF-2 routing is implemented, another says a separate FF-2 phase is required.
8. **Historical reconciliation artefacts:** the prior audit, matrix and proposed registry still describe eight Active graphs and recommend implementing KG-5.
9. **Evidence portability:** AG-1 and KG-5 lock reports cite formal phase reports that are ignored and absent from Git.

## 8. Fresh graph verification

| Check | Result |
|---|---|
| Unified graph audit | 244 PASS, 3 INFO, 0 WARNING, 0 FAIL, 0 CRITICAL |
| KG-1 knowledge | 167 entries, 0 errors, 0 warnings |
| RG-1 unified checks | PASS with informational items |
| DG-1 | 32 passed, 0 warnings, 0 failed |
| WG-1 | 21 passed, 0 warnings, 0 failed |
| KG-4 | All checks passed |
| FF-1 | 31/31 passed |
| AG-1 | 27 passed, 0 warnings, 0 failed |
| KG-5 | 30/30 passed |
| BRAIN-2 runtime search | 51/51 passed |

These checks prove schema and declared-reference validity. They do not erase the contradictions above because the current verifier does not test those conditions.

## 9. Pending-count verdict and recommended next graph

- **Registry Pending Count:** **0**.
- **Effective Pending Count:** **6**.
- **Genuinely pending graph implementation after reconciliation:** **BRAIN-3.5 / KG-5 runtime consumption**.
- **BRAIN-5:** remains Deferred.
- **RG-2:** remains Unverified.

Before BRAIN-3.5 begins, a narrow registry correction should update KG-5 status, BRAIN-1 count, reverse dependencies, RG-1 version/count, FF-1 future text and verifier rules. Current production authorization and financial-report blockers must also be cleared under their own corrective programmes.

The live registry was not modified by this audit.
