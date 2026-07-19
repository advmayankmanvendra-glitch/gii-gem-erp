# WG-3A Workflow Enforcement Foundation Report

**Date:** 2026-07-17  
**Phase:** WG-3A — Workflow Enforcement Infrastructure Foundation  
**Branch:** phase-16-enterprise-crm-integration  
**Commit:** e53f187 (parent), f544b68 (subrepo)  
**Base documents:** WG-2 audit, WG-1 workflow graph, FF-1 feature graph, DG-1 database graph

---

## 1. Executive Summary

WG-3A builds the first non-invasive workflow enforcement foundation for GII GeM ERP. It creates a shared read-only workflow stage engine that codifies the WG-1 Government Supply Lifecycle into runtime-accessible pure functions, establishes a Work Order root policy, defines an enforcement result contract, and provides a soft warning layer for detecting missing workflow linkage.

**All WG-2 gaps are addressed as a detection foundation.** Hard blocking is deferred to WG-3B and beyond. No existing user workflows are blocked. No accounting, voucher, inventory, GST, database, IPC, preload, or report SQL logic was changed.

---

## 2. WG-2 Findings Addressed

| WG-2 Finding | WG-3A Resolution |
|---|---|
| 1. No runtime enforcement engine | Created `workflowStageEngine.js` with 17 pure functions |
| 2. All 11 required stage transitions skippable | Stage prerequisites are now detectable via `evaluateWorkflowAction()` — returns `"warn"` for missing prerequisites |
| 3. 9 of 12 active screens have zero stage enforcement | Stage mapping from view key and table name to WG-1 stage is now codified |
| 4. Voucher-to-Order linkage absent | `getWorkflowWarningsForAction()` detects missing `supply_order_id` — returns `"warn"`, not block |
| 5. Work Order root not visible downstream | `WORK_ORDER_ROOT_POLICY` codified as a reusable exported object |
| 6. Help Assistant `checkCurrentStage()` missing | Safe read-only placeholder created, deferred to WG-3F |
| 7. Order status free-text not tied to lifecycle | Detection layer added — enforcement of status-to-stage linking deferred to WG-3D |

---

## 3. Files Created

| File | Description |
|---|---|
| `src/renderer/modules/workflow/workflowStageEngine.js` | Core workflow stage engine — 17 exported pure functions, 2 policy objects, 7 internal data structures |
| `src/renderer/modules/workflow/index.js` | Module re-export barrel file |
| `scripts/verify-workflow-enforcement-foundation.js` | Verification script — 62 checks covering all engine functions, contracts, mapping, and safety rules |

### Files Modified

| File | Change |
|---|---|
| `package.json` | Added `verify:workflow-enforcement` script; added script to `lint:syntax` |

No application logic files were modified.

---

## 4. Workflow Utility API

### Data Structures

| Structure | Content |
|---|---|
| `WG1_GRAPH` | Lifecycle metadata (root stage, entry stage, accounting/inventory/GST start stages) |
| `STAGE_DEFINITIONS` | 18 stage objects with id, label, upstreamDeps, downstreamDeps, allowedActions, blockedActions, impact flags |
| `STAGE_ORDER` | Ordered array of 18 stage IDs |
| `VIEW_KEY_TO_STAGE` | 22 view key → stage ID mappings |
| `TABLE_TO_STAGE` | 22 table name → stage ID mappings |
| `WORK_ORDER_ROOT_POLICY` | Codified Work Order parent entity policy |

### Pure Functions

| Function | Returns | Purpose |
|---|---|---|
| `getWorkflowStageDefinition(stageId)` | Stage object or null | Lookup stage by ID |
| `getNextStages(stageId)` | string[] | Downstream stage IDs |
| `getPreviousStages(stageId)` | string[] | Upstream stage IDs |
| `isStageRequired(stageId)` | boolean | Whether stage is required (not optional) |
| `isStageOptional(stageId)` | boolean | Whether stage is optional |
| `getOperationalRootStage()` | string | Returns "WORK_ORDER" |
| `getWorkflowStageForView(viewKey)` | string or null | Map route view key to stage |
| `getWorkflowStageForTable(tableName)` | string or null | Map database table to stage |
| `getWorkflowImpactForStage(stageId)` | `{ accounting, inventory, gst }` | Impact flags for stage |
| `getAllStageIds()` | string[] | All 18 stage IDs |
| `getActiveStageIds()` | string[] | Only active stages |
| `getStageOrderIndex(stageId)` | number | Position in lifecycle order |
| `isBeforeStage(stageA, stageB)` | boolean or null | Whether A is before B |
| `isAfterStage(stageA, stageB)` | boolean or null | Whether A is after B |
| `getLifecycleSummary()` | object | Full lifecycle metadata |
| `getWorkOrderRootPolicy()` | object | Work Order root policy copy |
| `evaluateWorkflowAction(actionContext)` | EnforcementResult | Core enforcement evaluation |
| `getWorkflowWarningsForAction(actionContext)` | Warning[] | Soft warning detection |
| `checkCurrentStage(entityType, entityId)` | Placeholder | Deferred to WG-3F |

---

## 5. Stage Mapping Table

### View Key → WG-1 Stage

| View Key | WG-1 Stage |
|---|---|
| supply_orders | WORK_ORDER |
| order_items | WORK_ORDER |
| procurements | SUPPLIER_PURCHASE_ORDER |
| procurement_requirements | PROCUREMENT_PLANNING |
| supplier_purchase_orders | SUPPLIER_PURCHASE_ORDER |
| grn_report | GOODS_RECEIPT_GRN |
| stock_inwards | GOODS_RECEIPT_GRN |
| stock_reservations | INVENTORY_RESERVATION |
| delivery_challans | DELIVERY_CHALLAN |
| stock_outwards | DELIVERY_CHALLAN |
| installation | INSTALLATION |
| crac_management | CRAC |
| crac_entry | CRAC |
| invoices | SALES_INVOICE_GST_INVOICE |
| sales_invoices | SALES_INVOICE_GST_INVOICE |
| receivables | DEPARTMENT_RECEIVABLE |
| payments | RECEIPT |
| payments_received | RECEIPT |
| supplier_payments | RECEIPT |
| receipt_allocation_workflow | RECEIPT |
| order_closure_tracking | ORDER_CLOSURE |
| profitability | PROFITABILITY_ANALYSIS |

### Database Table → WG-1 Stage

| Table | WG-1 Stage | Accounting Protected |
|---|---|---|
| supply_orders | WORK_ORDER | No |
| order_items | WORK_ORDER | No |
| procurements | SUPPLIER_PURCHASE_ORDER | Yes |
| procurement_items | SUPPLIER_PURCHASE_ORDER | No |
| goods_receipts | GOODS_RECEIPT_GRN | No |
| stock_inwards | GOODS_RECEIPT_GRN | No |
| stock_reservations | INVENTORY_RESERVATION | No |
| delivery_challans | DELIVERY_CHALLAN | No |
| delivery_challan_items | DELIVERY_CHALLAN | No |
| crac_records | CRAC | No |
| invoices | SALES_INVOICE_GST_INVOICE | Yes |
| receivables | DEPARTMENT_RECEIVABLE | Yes |
| payments | RECEIPT | Yes |
| supplier_payments | RECEIPT | Yes |
| purchase_orders | PURCHASE_ORDER_GEM_ORDER | No |

---

## 6. Work Order Root Policy

The `WORK_ORDER_ROOT_POLICY` object states:

- **Policy:** Work Order / Supply Order is the operational parent entity for the Government Supply Lifecycle.
- **Implementation table:** `supply_orders`
- **Implementation route key:** `supply_orders`
- **Operational root stage:** `WORK_ORDER`
- **Impact:** `createsAccountingImpact=false`, `createsInventoryImpact=false`, `createsGSTImpact=false`
- **Linkage field:** Downstream commercial records must reference `supply_order_id`
- **Enforcement:** Detection only in WG-3A (`linkageEnforcementIn: "WG-3D"`)
- **Rule references:** 5 documents (parent entity rule, WG-1, DG-1, KG-4, FF-1)

---

## 7. Soft Warning Rules

`getWorkflowWarningsForAction()` detects these patterns as soft warnings:

| Warning ID | Condition | Message |
|---|---|---|
| `missing_work_order_linkage` | Creating record on non-root, non-planning stage without `supply_order_id` or `order_id` | "Creating a record on stage X without a linked Work Order / Supply Order" |
| `invoice_without_work_order` | Creating invoice at SALES_INVOICE_GST_INVOICE without `supply_order_id` | "Creating invoice without Work Order / Supply Order linkage" |
| `receipt_without_invoice_linkage` | Posting receipt at RECEIPT without `invoice_id` or `receivable_id` | "Receipt voucher without linked invoice or receivable" |
| `delivery_without_reservation` | Creating Delivery Challan without `reservation_id` | "Delivery Challan without confirmed inventory reservation" |
| `crac_without_work_order` | Creating CRAC without `supply_order_id` | "CRAC record without linked Work Order" |
| `profitability_without_closure_check` | Viewing profitability | "Profitability analysis should be based on closed orders" |
| `voucher_dashboard_without_work_order_context` | Opening voucher dashboard without Work Order context | "Voucher Dashboard opened without Work Order context" |
| `grn_without_purchase_order_linkage` | Creating GRN without `supply_order_id` | "GRN without linked purchase order" |

All warnings use `enforcementMode: "warn"` — no hard blocking.

---

## 8. What Remains Unenforced (Deferred)

| Feature | Deferred To | Reason |
|---|---|---|
| Screen-level route guards | WG-3C | Need route metadata integration |
| Voucher-to-Order linkage enforcement | WG-3D | Hard requirement for `supply_order_id` on voucher creation |
| Voucher Dashboard stage gating | WG-3E | Dashboard conditionally showing/hiding voucher types |
| Help Assistant live stage integration | WG-3F | `checkCurrentStage()` needs DB access to query entity stage |
| Order status linked to lifecycle | WG-3D | Requires `workflow_stage` column or status-to-stage mapping |
| Hard blocking of stage-skipping | WG-3B | Soft warnings only in WG-3A |
| Skip-rule enforcement for optional transitions | WG-3B | Programmatic evaluation of skip conditions |

---

## 9. Why Hard Blocking Is Deferred

1. **WG-2 audit found zero enforcement infrastructure** — introducing hard blocking in the same phase would risk breaking existing workflows without proper testing
2. **Existing records may have missing linkages** — blocking would prevent access to legacy data
3. **Soft warning layer must be validated first** — users need to see warnings before being blocked
4. **Stage progression tracking not yet implemented** — no `workflow_stage` column exists on `supply_orders`
5. **Help Assistant cannot explain blocks yet** — `checkCurrentStage()` is still a placeholder

WG-3B will upgrade select warnings to soft blocks where the record context is known to be safe.

---

## 10. Verification Results

| Command | Result | Notes |
|---|---|---|
| `lint:syntax` | PASS | Includes new verify script syntax check |
| `build` | PASS | 245 modules, pre-existing chunk size warning |
| `verify:workflow-graph` | PASS | 21/21 — WG-1 graph validated |
| `verify:workflow-enforcement` | PASS | 62/62 — all foundation checks pass |
| `verify:feature-function-graph` | PASS | 31/31 — FF-1 graph validated |
| `verify:assistant-relevance` | PASS | 258/266 (96.99%) |
| `verify:erp` | PASS | All sub-verifications PASS |
| `verify:accounting` | PASS | Development profile, 0 balance |
| `verify:financials` | PASS | Trial balance 0 difference |
| `verify:controls` | PASS | 12/12 — financial year lock, permissions, audit |
| `verify:voucher-inventory` | PASS | 5 posted vouchers, 0 trial balance difference |
| `verify:flow` | PASS | Full operational flow |
| `verify:phase10` | PASS | Auto-reservation, guided voucher, phase10 flow |

---

## 11. Recommendation for WG-3B

**Proceed to WG-3B — Soft Workflow Warning Activation.**

WG-3A foundation is complete and verified (62/62). The following are ready:

1. `workflowStageEngine.js` is importable and functional
2. All stage mappings are defined and verified
3. Enforcement result contract returns correct `"allowed"` / `"warn"` / `"blocked"` decisions
4. Soft warning layer detects 8 patterns of missing workflow linkage
5. No database, accounting, voucher, inventory, GST, IPC, or report logic was changed

WG-3B should:
- Integrate `getWorkflowWarningsForAction()` into existing screen components as visible UI warnings (toast, banner, or panel)
- Selectively upgrade some `"warn"` decisions to `"blocked"` where the record context is known to be safe (e.g., creating a new invoice without any work order existing)
- Add warning display for the Voucher Dashboard when no work orders exist
- Implement the first screen-level integration in the Billing and GRN screens

---

## Appendix A: Enforcement Result Contract

```js
{
  decision: "allowed" | "warn" | "blocked",
  stageId,
  actionType,
  reason,
  requiredPreviousStages: [],
  missingPrerequisites: [],
  operationalRootRequired: false,
  supplyOrderRequired: false,
  accountingImpact: false,
  inventoryImpact: false,
  gstImpact: false,
  suggestedNextStage,
  source: "WG-1",
  enforcementMode: "warn"   // WG-3A default
}
```

Default `enforcementMode` is `"warn"`. No global hard block is set.

## Appendix B: Verification Script Checks (62 total)

| Range | Checks |
|---|---|
| WF-01 to WF-02 | File existence |
| WF-03 to WF-09 | WG-1 graph reference, lifecycle, root policy, impact flags |
| WF-10 to WF-20 | Stage mapping (view key and table) |
| WF-21 to WF-27 | Stage definition, ordering, optional/required |
| WF-28 to WF-31 | Impact detection |
| WF-32 to WF-37 | Lifecycle summary, ordering, index |
| WF-38 to WF-46 | Enforcement contract contract validation |
| WF-47 to WF-51 | Warning layer structure |
| WF-52 to WF-53 | checkCurrentStage placeholder |
| WF-54 | Allowed action with supply_order_id |
| WF-55 to WF-58 | Data structure completeness |
| WF-59 to WF-61 | Safety: no DB/accounting/IPC imports |
| WF-62 | Enforcement mode is warn |

## Appendix C: Files Changed Tracker

```
src/renderer/modules/workflow/workflowStageEngine.js       (CREATED)
src/renderer/modules/workflow/index.js                      (CREATED)
scripts/verify-workflow-enforcement-foundation.js           (CREATED)
package.json                                                (MODIFIED — added script entry)
```

No existing application screens, services, or logic files were modified.
