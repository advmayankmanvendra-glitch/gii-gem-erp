# Gesture India Infrastructure (GII) Government e-Marketplace (GeM) Enterprise Resource Planning (ERP) Architecture and Technology Stack Report

**System:** Gesture India Infrastructure (GII) Government e-Marketplace (GeM) Enterprise Resource Planning (ERP)

**Evidence commit:** `8ce3a42849c68398207a3b9cd8737d57f015215e`

**Result:** **PASS WITH WARNINGS**

**Production authorization readiness:** **BLOCKED**

## 1. Architecture summary

The product is a single-user-machine Windows desktop application built around Electron, React and SQLite. It is not a web server or cloud service. The renderer never opens the SQLite database directly. Desktop actions normally flow through the preload bridge to an Inter-Process Communication (IPC) handler, then through a service or controlled database module.

```text
React screen/action
  -> desktop API selector
  -> sandboxed preload bridge
  -> Electron main IPC handler
  -> permission/session wrapper
  -> domain service
  -> database helper/transaction
  -> SQLite file
  -> result returned to renderer
```

The browser-preview adapter is intentionally read-only for sensitive actions. Printing uses a separate sandboxed hidden Electron window and React print templates.

## 2. Layer register

| Layer | Primary paths | Current responsibility | Evidence-backed state |
|---|---|---|---|
| Desktop lifecycle | `src/main/main.js` | Window creation, data-root bootstrap, IPC registration, print windows, shutdown | Active; 155 handlers |
| Security bridge | `src/preload/preload.cjs` | Exposes approved `window.giiGemErp` methods | Active; 154 invokes |
| Renderer shell | `src/renderer/App.jsx` | Login, layout, string-view routing, global state and screen orchestration | Active; 1,683 lines and high change risk |
| Screen resolution | `App.jsx`; unused `config/screenRegistry.jsx` | Chooses the active screen without React Router | Partly duplicated; Profit Simulator branch is stranded in the unused registry |
| Features/screens | `src/renderer/features/`, `src/renderer/screens/` | User interfaces, forms, dashboards and reports | 41 graph screens, 53 graph feature files |
| Services | `src/main/services/` | Accounting, inventory, operations, recovery, import, authorization and reports | 33 modules |
| Database | `src/main/database/` | Connection, schema, create/read/update/delete helpers, report builders, seed/migration and account mappings | 8 modules; 73 runtime-created tables |
| Knowledge/graphs | `src/renderer/knowledge/`, `src/renderer/modules/erpBrain/` | Graph assets, source-backed search and Help Assistant | Nine registered graphs; six runtime-connected assets |
| Print/export | `src/renderer/print/`, main print handlers | Vouchers, reports, preview and export | 17 graph print files; sandboxed print window |
| Verification | `scripts/`, `package.json` | Syntax, build, accounting, graph, workflow, control and smoke checks | 42 named `verify:*` package commands; no automatic commit gate |
| Packaging | `electron-builder` settings in `package.json` | Nullsoft Scriptable Install System and portable Windows builds | Configured; not production-certified by this audit |

## 3. Technology stack

Exact resolved versions are taken from `package-lock.json` and the installed dependency tree.

| Technology | Version | Purpose |
|---|---:|---|
| Electron | 37.0.0 | Windows desktop runtime and main/preload process separation |
| React | 19.2.7 | Renderer user interface |
| React DOM | 19.2.7 | React renderer attachment |
| Vite | 7.3.5 | Renderer build and local preview |
| Vite React plugin | 5.2.0 | React build transformation |
| better-sqlite3 | 12.10.0 | Synchronous embedded SQLite access in the Electron main process |
| Playwright | 1.61.1 | Packaged desktop smoke automation |
| Electron Builder | 26.15.3 | Windows installer and portable package generation |
| Ajv (Another JSON Schema Validator) | 8.17.1 | Graph schema verification |
| concurrently | 9.2.1 | Coordinated development processes |
| cross-env | 7.0.3 | Cross-platform environment variables |
| wait-on | 8.0.5 | Development-server readiness wait |

No server framework, React Router, Redux, Jest, Vitest, ESLint, formatter, external Artificial Intelligence (AI) provider Software Development Kit (SDK), Large Language Model (LLM) gateway or GeM API client dependency is declared.

The `lint:syntax` command is a `node --check` syntax suite; it is not a full style or semantic linter. `npm ls` also reported four extraneous installed packages, including `electron-updater`; they are not declared application dependencies and should not be treated as current product features.

## 4. Renderer and routing

- Routing uses string view keys and conditional branches inside `App.jsx`; no URL router is installed.
- Navigation declares 172 menu appearances, 165 unique keys and 175 view titles.
- Seven navigation keys intentionally appear in multiple business groups.
- `config/screenRegistry.jsx` contains a modular resolver but no runtime import was found.
- `profit_simulator` exists in navigation and has a component, but the live `App.jsx` lacks a branch. It is the single confirmed unresolved navigation key.
- RG-1 reports 252 renderer files, 700 imports, 114 graph-discovered routes, 41 screens, 41 components, 53 feature files and no circular imports.

RG-1 route count is not equivalent to the live navigation count. Its generator discovers source patterns and presently misses newer or indirectly resolved routes. This is graph coverage drift, not evidence that all 51 missing keys are broken.

Principal renderer concentration risks:

| File | Approximate lines | Risk |
|---|---:|---|
| `src/renderer/App.jsx` | 1,683 | Central routing and state concentration |
| `src/renderer/api/browserFallbackApi.js` | 1,117 | Large preview adapter |
| `src/renderer/features/importExport/TallyMasterMigrationAssistantScreen.jsx` | 1,071 | Large migration interface |
| `src/renderer/features/billing/BillingVoucherScreen.jsx` | 979 | Large accounting-sensitive screen |
| `src/renderer/screens/EnvironmentManager/EnvironmentManagerScreen.jsx` | 963 in RG-1 | Large release-control screen |

## 5. Desktop bridge and authorization

Static comparison found:

- 155 unique `ipcMain.handle` channels in the Electron main process.
- 154 unique `ipcRenderer.invoke` channels in preload.
- One main-only channel: `imports:rollback-preview`.
- No preload-only channel.

The main-only rollback-preview channel is not automatically a defect; it may be an internal or unfinished path. It is, however, an undocumented contract mismatch.

### 5.1 Roles

The backend defines six roles:

- Super Administrator — all permissions.
- Administrator — create/edit/delete/reverse/approve/post, backup/restore, financial-year, import/export, settings and account mapping.
- Accountant — accounting write/reverse, opening balance, import/export, reports, backup and account mapping.
- Manager — create/edit/approve, export, reports and backup.
- Data Entry Operator — create/edit/import/export and backup.
- Viewer — export and reports.

Password hashing uses `crypto.scryptSync`; the service also defines failed-login limits, a 30-minute session timeout and an eight-character minimum password length.

### 5.2 Authorization warning

Two permission wrappers exist:

- `guarded()` uses identity context supplied with the call.
- `sessionGuarded()` binds the permission decision to the desktop session.

Most handlers still use `guarded()`. If no user context is supplied, the authorization helper selects the first active administrator for the check. The following high-impact handler families are registered without an explicit permission wrapper:

- Environment profile and environment-type changes.
- Go-live execution, verification, completion and rollback.
- Certificate generation.
- Operational reset execution, enhanced reset and rollback.

This audit did not attempt exploitation and makes no vulnerability claim. The source evidence is nevertheless sufficient to classify production authorization readiness as **BLOCKED** until these paths are session-bound and independently verified.

## 6. Database architecture

- Storage engine: SQLite through `better-sqlite3`.
- Runtime settings: foreign keys enabled and Write-Ahead Logging (WAL) enabled.
- Core table declarations: 70.
- Account-mapping extension tables: 3.
- Total runtime-created tables: 73.
- DG-1 relationships: 57.
- DG-1 posting functions: 22.
- DG-1 report sources: 26.
- DG-1 accounting-protected tables: 21.

Application code and runtime data roots are separated. Packaged first launch copies a bundled database resource into the runtime data location. This is convenient but release-sensitive: the bundled database must be demonstrably sanitized and version-compatible before production packaging.

The schema is built through idempotent creation/migration code rather than an external migration framework. DG-1 records that migration 002 is missing and that some schema changes lack an explicit versioned migration. A production data upgrade therefore remains subject to the repository's backup, isolated restore, migration and rollback gates.

## 7. Accounting and inventory boundaries

Accounting services use integer minor units, balanced debit/credit validation and atomic voucher-plus-ledger transactions. Fresh Financial System Reliability (FSR) suites verify company isolation, draft/cancelled exclusion, year-end continuity, inventory accounting, party reconciliation, rounding and audit evidence.

Inventory services create transactional stock-ledger and inventory-movement rows and maintain weighted-average valuation. The Work Order stage itself creates no accounting, inventory or GST impact.

The remaining financial architecture gap is classification authority:

- Account mapping registry and review workflows exist through FSR-2B.2B.
- Report builders remain on the pre-cutover classification path.
- Renderer financial grouping still uses account-name heuristics.
- `verify:financial-reports` therefore fails checks 9 and 16 while all balance/equality controls pass.

FSR-2B.3 is the planned corrective implementation. It is accounting-sensitive and requires a separate architecture, backup, compatibility and certification gate.

## 8. Workflow architecture

WG-1 and `workflowStageEngine.js` express the 18-stage Work Order-root lifecycle. The engine can map view keys and tables, evaluate declared prerequisites and produce warnings. It deliberately defaults to `warn`, has no write imports, and does not hard-block existing workflows.

No live runtime importer of the workflow engine was found. Its current-stage lookup explicitly defers to later WG-3 work. The graph and engine are therefore a validated detection/advisory foundation, not proof that users cannot skip stages.

The named Supplier Purchase Order stage is semantically unresolved: current `procurements` records supplier purchase invoices/values and can post Purchase vouchers. There is no distinct `supplier_purchase_orders` or `purchase_order_items` runtime table. This should be reconciled before hard workflow enforcement.

## 9. Intelligence architecture

Runtime-connected assets:

- BRAIN-1 repository through the source-backed search index.
- RG-1, DG-1, WG-1 and KG-4 through `graphLoader.js`.
- FF-1 through `featureFunctionBridge.js`.

Registered but not application-runtime-connected:

- KG-1 metadata registry.
- AG-1 audit event graph.
- KG-5 document/manual graph.

The Help Assistant is read-only and source-backed. It can answer navigation, workflow and guidance questions but cannot inspect arbitrary live records. It uses deterministic matching and graph/manual sources, not an LLM.

## 10. Reporting, printing and export

- Financial and operational data are assembled in database report builders and services.
- Screens render tables, drill-downs and export actions.
- Print output uses modular templates under `src/renderer/print/`.
- The Electron main process creates a sandboxed hidden print window for preview/printing.
- Dashboard wiring verification covered 42 card routes and passed 20/20 checks.

Manual desktop print/export click-through was not performed because this audit changed no runtime feature. Historical or generated reports are not accepted as current production proof.

## 11. Recovery, packaging and delivery

Implemented source paths include live backup, pending-restart restore, health checks, safe-delete controls, production-readiness scoring, go-live backup/verification/rollback and support-bundle generation.

Packaging targets Windows Nullsoft Scriptable Install System (NSIS) and portable output. No tracked Continuous Integration/Continuous Deployment (CI/CD) workflow, Husky hook or pre-commit framework was found. Verification is therefore manually invoked and can be bypassed outside the governed working method.

## 12. Recommended architecture sequence

1. Session-bind every high-impact/write handler and guard environment, go-live, certificate and reset paths.
2. Reconcile company context at entity search and billing boundaries.
3. Correct governance and graph registry drift and make consistency checks lock-blocking.
4. Complete FSR-2B.3 backend financial classification and remove renderer heuristics.
5. Reconcile the Supplier Purchase Order entity and then stage hard workflow enforcement.
6. After certification, begin BRAIN-3.5 / KG-5 runtime consumption.

No architecture, permission, database or production change is authorized by this report.
