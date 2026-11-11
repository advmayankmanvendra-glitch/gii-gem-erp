# Gesture India Infrastructure (GII) Government e-Marketplace (GeM) Enterprise Resource Planning (ERP) Governance Document Register

**System:** Gesture India Infrastructure (GII) Government e-Marketplace (GeM) Enterprise Resource Planning (ERP)

**Evidence date:** 21 August 2026

**Result:** **PASS WITH WARNINGS**

**Governance baseline:** **BLOCKED pending reconciliation**

**Abbreviation key:** Financial System Reliability (FSR), Release/Migration/Data continuity (RMD), Knowledge Graph (KG), Renderer Graph (RG), Database Graph (DG), Workflow Graph (WG), Feature Function Graph (FF) and Audit Graph (AG).

## 1. Register rules

The inventory counts below describe the repository before these eight audit deliverables were created. This register separates:

- **Normative** — tells future work what must be done.
- **Architecture baseline** — defines the approved structure or business model.
- **Programme evidence** — audit, implementation, stabilization, certification, lock and gate records.
- **Generated/local evidence** — useful current-machine output that is not committed authority.
- **Historical** — valid evidence of an earlier state, not a current source of truth.

When sources conflict, current implementation plus the most specific later committed rule is reported, but the conflict remains unresolved until the owner approves a correction.

## 2. Repository evidence inventory

| Inventory | Count | Git state |
|---|---:|---|
| Files under `docs/` | 189 | All tracked |
| Files under `reports/` | 324 | 8 tracked; 316 ignored/local-only |
| Combined evidence files | 513 | 197 tracked; 316 ignored/local-only |
| Markdown files | 508 | Five other JSON/text artefacts |
| Filename-selected governance/evidence artefacts | 481 | 165 tracked; 316 ignored/local-only |
| Tracked `docs/architecture` | 132 | 130 Markdown, 2 JSON |
| Tracked `docs/audit` | 16 | Historical audit evidence |
| Tracked root `reports/` exceptions | 8 | Older committed reports |

The 481 selected artefacts overlap by purpose:

| Category | Count |
|---|---:|
| Architecture | 142 |
| Audit | 125 |
| Phase | 101 |
| Report | 387 |
| Governance | 13 |
| Baseline | 5 |
| Stabilization | 24 |
| Certification | 28 |
| Lock | 39 |
| Policy | 6 |
| Dependency | 6 |
| Registry/register | 14 |
| Roadmap | 4 |
| Readiness | 19 |
| Constitution | 3 |

Counts overlap because one certification report may also be a phase, architecture and lock artefact.

## 3. Primary normative and architecture register

| Document | Classification | Current status | Authority/enforcement note |
|---|---|---|---|
| `AGENTS.md` | Normative developer entry point | BLOCKED | Contains 32 numbered rules but header remains v3.1; includes Accounting Intelligence Repository Rule 31 |
| `docs/GII-GeM-ERP-Core-Governance-Principles.md` | Normative complementary principles | PASS WITH WARNINGS | Version 1.0; overlaps permanent rules |
| `docs/architecture/permanent-architecture-rules.md` | Normative constitution | BLOCKED | Header v3.1, history v3.3; omits Rule 31 and jumps from Rule 30 to Rule 32 |
| `docs/architecture/GII-GeM-ERP-Enterprise-Architecture-Baseline-v1.0.md` | Architecture baseline with historical/current content | PASS WITH WARNINGS | Strong blueprint, but its broad supersession claim predates later rules and graph programmes |
| `docs/architecture/phase-governance-pipeline.md` | Normative phase pipeline | PASS WITH WARNINGS | Unversioned, partly script-checked and not automatically enforced at commit or pull request |
| `docs/architecture/global-ux-governance-standard.md` | Normative User Experience (UX) standard | PASS WITH WARNINGS | Unversioned; primarily checklist/manual review with targeted tests |
| `docs/architecture/enterprise-intelligence-layer.md` | Frozen intelligence architecture | BLOCKED | Says eight graphs although nine are Active |
| `repository/graph-registry.json` | Machine graph discovery source | BLOCKED | Nine Active graphs; KG-5 also appears as Planned in historical stages |
| `docs/architecture/graph-registry.md` | Human graph register | BLOCKED | Mirrors the KG-5 Active/Planned conflict |
| `docs/architecture/gii-operational-chain-of-command-rule.md` | Normative business lifecycle | PASS WITH WARNINGS | Unversioned; preserves the approved chain, while runtime enforcement remains partial |
| `docs/architecture/work-order-parent-entity-rule.md` | Normative entity rule | PASS | Work Order/Supply Order is operational parent and non-accounting |
| `docs/architecture/workflow-governance-registry.md` | Normative workflow register | PASS WITH WARNINGS | Unversioned; government supply lifecycle registered and future lifecycle families named |
| `docs/architecture/workflow-dependency-matrix.md` | Constitutional dependency matrix | PASS WITH WARNINGS | Unversioned detailed source map; not a runtime enforcement engine |
| `docs/architecture/business-voucher-dependency-matrix.md` | Accounting architecture reference | PASS WITH WARNINGS | Missing clear version/status header; partly source-verified |
| `docs/tally-intelligence/AIR/` | Accounting Intelligence Repository (AIR) knowledge family | PASS WITH WARNINGS | 24 tracked reference documents; ERP software is reference, not authority |
| `README.md` | Entry-level project narrative | PASS WITH WARNINGS | Earlier phase language does not describe the current system; should not override source or current governance |

Eight primary current governance documents lack a clear document-version header: the phase pipeline, Global UX standard, graph registry Markdown, the three operational/workflow rules, Workflow Dependency Matrix and Business Voucher Dependency Matrix.

## 4. Programme evidence register

| Programme family | Main tracked evidence | Current classification | Evidence continuity |
|---|---|---|---|
| BRAIN-1 to BRAIN-4 | Enterprise Intelligence Layer reports, source-backed search, Help Assistant and Ask ERP Brain reports/locks | PASS | Completed stages and Active components have tracked implementation/verifier evidence; older roadmap wording is historical |
| BRAIN-5 | Feasibility study | NOT STARTED | Registry classification is Deferred; no approved runtime LLM gateway |
| RG-1 | Renderer graph schema/report and generated graph | PASS WITH WARNINGS | Active graph; generator/count/version metadata drift |
| DG-1 | Database graph foundation, schema, verifier and accounting mapping reports | PASS WITH WARNINGS | Active graph; seven known gaps and FSR-2B.3 cutover pending |
| WG-1/WG-2/WG-3 | Workflow graph, readiness audit and warning-only enforcement foundation | PASS WITH WARNINGS | Active/completed graph family; detection foundation verified, hard enforcement not runtime-connected |
| KG-4 | Voucher/accounting graph reports and verifier | PASS WITH WARNINGS | Active graph; six documented gaps and future extensions |
| FF-1/FF-2 | Feature-function graph and BRAIN-4.3B runtime routing reports | PASS WITH WARNINGS | FF-1 Active and FF-2 Completed; current graph still contains stale text saying FF-2 is required |
| AG-1 | Stabilization, certification, lock and executive gate | LOCKED | Active graph; formal phase report is ignored and live audit-row mapping remains deferred |
| KG-5 | Architecture audit, implementation lock note, certification, lock and executive gate | PASS WITH WARNINGS | Active/locked implementation; formal phase report ignored and no distinct stabilization programme/report |
| FSR-1/FSR-2A/FSR-2B | Accounting audits, policies, verification and lock records | PASS WITH WARNINGS | Strong locked test/commit chain; FSR-2B.3 and two report-structure failures remain |
| Release/Migration/Data continuity (RMD) | RMD-0 and RMD-0A audits/baselines | BLOCKED | RMD-1 production migration/release work remains pending |
| Renderer programme | Baseline and many phase reports | PASS WITH WARNINGS | Baseline tag exists; many reports are ignored/local-only |
| Database refactor Phases 7A-7C | Baseline, tracked reports and restore tags | LOCKED | Completed and unusually reproducible because reports are among tracked exceptions |

## 5. AG-1 evidence chain

| Lifecycle step | Evidence | Result |
|---|---|---|
| Implementation | Commit `92aa0a8`; graph, schema, verifier, registry, package and docs | PASS |
| Stabilization | Commit `e45fcb6`; stabilization report, registry reconciliation and regenerated graph outputs | PASS |
| Registry reconciliation | Commit `5c3c5f5` | PASS WITH WARNINGS; current later KG-5 conflict exists |
| Certification/lock/gate | Commit `caced4d` | PASS |
| Formal phase report | `reports/phase-ag-1-audit-intelligence-graph-report.md` | BLOCKED for Git reproducibility; ignored/untracked |
| Fresh validation | 27/27 AG-1; unified audit 244 PASS, 3 INFO | PASS |

## 6. KG-5 evidence chain

| Lifecycle step | Evidence | Result |
|---|---|---|
| Architecture audit | Commit `819c6c9` | PASS |
| Implementation | Commit `2244bb8`; graph, schema, generator, verifier, registry, package and docs | PASS |
| Stabilization | No distinct programme/report/commit; gate treats first verifier pass as stabilization | BLOCKED against literal Rule 27 |
| Certification/lock/gate | Commit `8ce3a42` | PASS WITH WARNINGS |
| Formal phase report | `reports/phase-kg-5-manual-graph-report.md` | BLOCKED for Git reproducibility; ignored/untracked |
| Fresh validation | 30/30 KG-5; unified audit 244 PASS, 3 INFO | PASS |

## 7. Git/tag governance register

| Item | Current evidence |
|---|---|
| Branch | `phase-16-enterprise-crm-integration` |
| HEAD | `8ce3a42849c68398207a3b9cd8737d57f015215e` |
| Upstream relation | Ahead 0, behind 0; live branch head matched during this audit |
| Tags | 92 total: 33 annotated, 59 lightweight |
| Latest tag by creation date | `fsr-2b-baseline-2026-07-29` at `350eb13` |
| Distance from latest tag | 13 commits; current HEAD untagged |
| Automated repository gate | None found in `.github/workflows`, Husky or pre-commit configuration |
| Package verification surface | 42 `verify:*` commands; master pipeline 32 steps; 21 lock-blocking policy steps |

## 8. Header and metadata quality

Strict header checks found:

- Tracked Markdown with `Version:` or `Document Version:`: 10 of 194.
- Local-only Markdown with such a version header: 12 of 314.
- Tracked Markdown with a strict `Status:` header: 36 of 194.
- Local-only Markdown with a strict status header: 46 of 314.

Absence of a strict header does not invalidate technical content. It does make authority, currency and supersession harder to determine across 500-plus evidence files.

## 9. Conflict register

### HIGH

1. `.gitignore` excludes `reports/*`, making 316 audit/evidence files unavailable to a fresh clone.
2. Permanent-rule version and Rule 31 content differ between `AGENTS.md` and the standalone permanent rules.
3. KG-5 is both Active and Planned in the authoritative graph register.
4. KG-5 did not perform a separately evidenced stabilization step even though Rule 27 states no step may be skipped.

### MEDIUM

5. AG-1 and KG-5 lock reports call their ignored formal phase reports “OK.”
6. The latest local ignored master report says Safe to Lock: No because that historical run used a dirty tree; no committed clean-HEAD master output replaces it.
7. Enterprise Intelligence Layer documentation says eight graphs instead of nine.
8. Governance verification is manually invoked rather than automatically enforced.
9. Current AG-1/KG-5 locks and 13 recent commits have no new named baseline/lock tag.

### LOW

10. README and older Planned references are stale unless explicitly treated as historical.
11. Several primary normative documents lack version/status metadata.

## 10. Recommended governance correction

1. Choose and approve one canonical permanent-rule version; merge Rule 31 and reconcile v3.1/v3.3 metadata.
2. Preserve mandatory phase reports in a tracked location or narrowly allowlist them from the `reports/*` ignore rule.
3. Make phase-report presence, graph historical-status consistency, reverse dependencies and clean-HEAD master evidence lock-blocking.
4. Correct current graph counts/statuses and mark the old reconciliation artefacts as historical snapshots.
5. Either perform a genuine KG-5 stabilization step or amend Rule 27 to define an approved, documented no-change stabilization outcome.
6. Produce a clean committed-head verification record before any new major programme.

No governance source, registry, report, tag, commit or remote state was changed by this audit.
