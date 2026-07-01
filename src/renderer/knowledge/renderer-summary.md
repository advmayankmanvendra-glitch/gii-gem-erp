# GII GeM ERP — Renderer Summary (RG-1 v2.0 Enhanced)

**Graph ID:** RG-1
**Version:** 2.0
**Generated:** 2026-07-01T11:05:33.683Z

---

## 1. Renderer Size
| Metric | Value |
|--------|-------|
| Source Files | 153 |
| Total Lines | 34,513 |
| Import Statements | 349 |
| App.jsx | 13290 lines (~665KB) |
| CSS (single file) | 7,042 lines (125KB) |
| Complexity Score | 491 |
| Architecture Density | 2.28 imports/file |

## 2. Screens (36 dedicated files, 114 routes)
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

## 3. Components (24 files)
- **Categories:** Layout, Overlays, Forms, Common UI, Tables, Health, CRAC, Help, Inventory, Operations, Accounting Controls, Dashboard
- **Most Shared Components:** CRACStatusCard (3x), ClosureChecklist (1x), CRACDocumentPanel (1x)
- **Avg Reuse:** 1x

## 4. Ownership
- **Help:** 23 files
- **Dashboard:** 22 files
- **Renderer Shell:** 20 files
- **Health Center:** 17 files
- **Print:** 17 files
- **Knowledge:** 15 files
- **CRAC:** 11 files
- **Deployment:** 5 files
- **Utilities:** 4 files
- **Accounting:** 3 files
- **Inventory:** 3 files
- **Operations:** 3 files
- **Master Data:** 3 files
- **Reports:** 3 files
- **Settings:** 2 files
- **Other:** 1 files
- **Profitability:** 1 files

## 5. Business Criticality
- **High:** 70 files
- **Low:** 55 files
- **Medium:** 21 files
- **Critical:** 7 files

## 6. Change Frequency
- **Occasionally Modified:** 111 files
- **Stable:** 39 files
- **Frequently Modified:** 3 files

## 7. Architectural Pattern
1. **Flat routing** — effectiveView state, no router library
2. **Monolithic App.jsx** — 13290 lines with inline CRUD and view switching
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
| High | 1 |
| Medium | 20 |
| Low | 132 |
- **High:** `App.jsx` (13290 lines, 45 imports) — Renderer Shell

## 11. Integration with Intelligence Layer
| Graph | Status |
|-------|--------|
| BRAIN-1 (ERP Knowledge) | Active (214 entries) |
| KG-1 (Metadata Registry) | Active (167 entries) |
| **RG-1 (Renderer Graph)** | **Active (v2.0 Enhanced)** |
| DG-1 (Database Graph) | Planned |
| WG-1 (Workflow Graph) | Planned |
| AG-1 (Audit Graph) | Planned |
