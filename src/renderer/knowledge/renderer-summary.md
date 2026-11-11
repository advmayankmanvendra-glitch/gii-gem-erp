# GII GeM ERP — Renderer Summary (RG-1 v2.0.0 Enhanced)

**Graph ID:** RG-1
**Version:** 2.0.0
**Generated:** 2026-08-14T10:26:34.805Z

---

## 1. Renderer Size
| Metric | Value |
|--------|-------|
| Source Files | 252 |
| Total Lines | 43,446 |
| Import Statements | 700 |
| App.jsx | 1684 lines (~84KB) |
| CSS (single file) | 7,042 lines (125KB) |
| Complexity Score | 700 |
| Architecture Density | 2.78 imports/file |

## 2. Screens (41 dedicated files, 114 routes)
- **Master Data:** companies, employees, suppliers, items, banks, warehouses, ledgers, groups
- **Transactions:** purchase, sales, receipt, payment, journal vouchers, credit/debit notes
- **Dashboard:** main dashboard with drilldown panels
- **Operations:** operations dashboard, order lifecycle, GRN, billing, procurement
- **Inventory:** stock summary, stock ledger, movements, reservations, low stock, valuation
- **Accounting:** voucher register, general ledger, trial balance, P&L, balance sheet, GST reports
- **Bank:** statement import, reconciliation, unmatched/duplicate entries
- **Voucher Proposals:** proposal queue, approval workflow, audit trail
- **CRAC:** CRAC management, entry, tracker, payment readiness, order closure (5 routes)
- **Settings, Documents, Help, Health Center, Safe Mode, Deployment**

## 3. Components (41 files)
- **Categories:** Layout, Overlays, Forms, Common UI, Tables, Health, CRAC, Help, Inventory, Operations, Accounting Controls, Dashboard
- **Most Shared Components:** AddRecordPanel (5x), DrilldownPanel (5x), CRACStatusCard (3x)
- **Avg Reuse:** 2x

## 4. Ownership
- **Dashboard:** 53 files
- **Other:** 47 files
- **Help:** 25 files
- **Renderer Shell:** 24 files
- **Knowledge:** 21 files
- **Health Center:** 17 files
- **Print:** 17 files
- **Utilities:** 12 files
- **CRAC:** 11 files
- **Master Data:** 5 files
- **Deployment:** 5 files
- **Accounting:** 3 files
- **Inventory:** 3 files
- **Operations:** 3 files
- **Reports:** 3 files
- **Settings:** 2 files
- **Profitability:** 1 files

## 5. Business Criticality
- **Low:** 118 files
- **High:** 100 files
- **Medium:** 27 files
- **Critical:** 7 files

## 6. Change Frequency
- **Occasionally Modified:** 193 files
- **Stable:** 56 files
- **Frequently Modified:** 3 files

## 7. Architectural Pattern
1. **Flat routing** — effectiveView state, no router library
2. **Monolithic App.jsx** — 1684 lines with inline CRUD and view switching
3. **Flat hierarchy** — App.jsx imports screens and components directly
4. **Single CSS** — styles/app.css with 7,042 lines
5. **Direct IPC** — apiClient prop passed from App.jsx

## 8. Suggested Future Extraction Order
- 1. Presentation-only components (components/common.jsx, overslays)
- 2. Config files (static data — navigation.js, viewDefinitions.js, etc.)
- 3. Print system (standalone template host)
- 4. Knowledge graphs (already separate)
- 5. Feature drilldowns (dashboard sub-screens)
- 6. Help/assistant modules
- 7. Health center and stability modules
- 8. Screens by domain (CRAC → master tools → settings → documents)
- 9. Core business voucher screens (highest risk — last)

## 9. Dependencies
```
Renderer → API Client → IPC → Main Process → Database / Preload
```

## 10. Risk Assessment
| Risk Level | Count |
|------------|-------|
| High | 3 |
| Medium | 38 |
| Low | 211 |
- **High:** `api/browserFallbackApi.js` (1118 lines, 2 imports) — Utilities
- **High:** `App.jsx` (1684 lines, 75 imports) — Renderer Shell
- **High:** `features/importExport/TallyMasterMigrationAssistantScreen.jsx` (1072 lines, 8 imports) — Dashboard

## 11. Integration with Intelligence Layer
| Graph | Status |
|-------|--------|
| BRAIN-1 (ERP Knowledge) | Active (224 entries) |
| KG-1 (Metadata Registry) | Active (167 entries) |
| **RG-1 (Renderer Graph)** | **Active (v2.0.0 Enhanced)** |
| DG-1 (Database Graph) | Active (73 tables) |
| WG-1 (Workflow Graph) | Active (18 stages) |
| KG-4 (Voucher and Accounting Graph) | Active (14 voucher types) |
| FF-1 (Feature Function Graph) | Active (50 features) |
| AG-1 (Audit Graph) | Active (97 events) |
| KG-5 (Document and Manual Graph) | Active (10 manuals) |
