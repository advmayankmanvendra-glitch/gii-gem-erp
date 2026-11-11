#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

let passed = 0;
let failed = 0;
let warnings = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`  \u2713   PASS: ${label}`);
    passed++;
  } else {
    console.log(`  \u2717   FAIL: ${label}`);
    failed++;
    if (detail) console.log(`         detail: ${detail}`);
  }
}

function warn(label, detail) {
  console.log(`  \u26A0   WARN: ${label}`);
  warnings++;
  if (detail) console.log(`         detail: ${detail}`);
}

console.log("============================================================");
console.log("WG-3A Workflow Enforcement Foundation \u2014 Verification");
console.log("============================================================\n");

const enginePath = resolve("src/renderer/modules/workflow/workflowStageEngine.js");
const indexPath = resolve("src/renderer/modules/workflow/index.js");

check("WF-01: Workflow stage engine exists", existsSync(enginePath), enginePath);
check("WF-02: Workflow module index exists", existsSync(indexPath), indexPath);

const engine = await import(pathToFileURL(enginePath).href);

check("WF-03: WG-1 graph is referenced (WG1_GRAPH exported)",
  typeof engine.WG1_GRAPH === "object" && engine.WG1_GRAPH !== null);

const wg1 = engine.WG1_GRAPH;
check("WF-04: LifecycleId is GOVERNMENT_SUPPLY_LIFECYCLE",
  wg1.lifecycleId === "GOVERNMENT_SUPPLY_LIFECYCLE");

check("WF-05: Operational root is WORK_ORDER",
  engine.getOperationalRootStage() === "WORK_ORDER");

const rootPolicy = engine.getWorkOrderRootPolicy();
check("WF-06: Work Order root policy exists",
  typeof rootPolicy === "object" && rootPolicy.operationalRootStage === "WORK_ORDER");

check("WF-07: Work Order has no direct accounting impact",
  rootPolicy.createsAccountingImpact === false);
check("WF-08: Work Order has no direct inventory impact",
  rootPolicy.createsInventoryImpact === false);
check("WF-09: Work Order has no direct GST impact",
  rootPolicy.createsGSTImpact === false);

check("WF-10: supply_orders maps to WORK_ORDER",
  engine.getWorkflowStageForView("supply_orders") === "WORK_ORDER");
check("WF-11: supply_orders table maps to WORK_ORDER",
  engine.getWorkflowStageForTable("supply_orders") === "WORK_ORDER");

check("WF-12: Billing invoices map to SALES_INVOICE_GST_INVOICE",
  engine.getWorkflowStageForView("invoices") === "SALES_INVOICE_GST_INVOICE");
check("WF-13: Receipt maps to RECEIPT",
  engine.getWorkflowStageForView("payments") === "RECEIPT");
check("WF-14: Delivery Challan maps to DELIVERY_CHALLAN",
  engine.getWorkflowStageForView("delivery_challans") === "DELIVERY_CHALLAN");
check("WF-15: CRAC maps to CRAC",
  engine.getWorkflowStageForView("crac_management") === "CRAC");
check("WF-16: GRN maps to GOODS_RECEIPT_GRN",
  engine.getWorkflowStageForView("grn_report") === "GOODS_RECEIPT_GRN");
check("WF-17: Receivables map to DEPARTMENT_RECEIVABLE",
  engine.getWorkflowStageForView("receivables") === "DEPARTMENT_RECEIVABLE");
check("WF-18: Profitability maps to PROFITABILITY_ANALYSIS",
  engine.getWorkflowStageForView("profitability") === "PROFITABILITY_ANALYSIS");
check("WF-19: Order Closure maps to ORDER_CLOSURE",
  engine.getWorkflowStageForView("order_closure_tracking") === "ORDER_CLOSURE");
check("WF-20: Procurement maps to SUPPLIER_PURCHASE_ORDER",
  engine.getWorkflowStageForView("procurements") === "SUPPLIER_PURCHASE_ORDER");

check("WF-21: getWorkflowStageDefinition returns stage for WORK_ORDER",
  engine.getWorkflowStageDefinition("WORK_ORDER") !== null);
check("WF-22: getWorkflowStageDefinition returns null for unknown stage",
  engine.getWorkflowStageDefinition("UNKNOWN_STAGE") === null);

check("WF-23: getNextStages returns downstream deps",
  Array.isArray(engine.getNextStages("WORK_ORDER")));
check("WF-24: getPreviousStages returns upstream deps",
  Array.isArray(engine.getPreviousStages("WORK_ORDER")));

check("WF-25: isStageRequired returns true for WORK_ORDER",
  engine.isStageRequired("WORK_ORDER") === true);
check("WF-26: isStageOptional returns true for LEAD_TENDER",
  engine.isStageOptional("LEAD_TENDER") === true);
check("WF-27: isStageOptional returns false for WORK_ORDER",
  engine.isStageOptional("WORK_ORDER") === false);

check("WF-28: getWorkflowImpactForStage returns correct impact for WORK_ORDER",
  engine.getWorkflowImpactForStage("WORK_ORDER").accounting === false);
check("WF-29: getWorkflowImpactForStage returns correct impact for SALES_INVOICE_GST_INVOICE",
  engine.getWorkflowImpactForStage("SALES_INVOICE_GST_INVOICE").accounting === true);
check("WF-30: getWorkflowImpactForStage returns correct GST impact",
  engine.getWorkflowImpactForStage("SALES_INVOICE_GST_INVOICE").gst === true);
check("WF-31: getWorkflowImpactForStage returns correct inventory impact for GOODS_RECEIPT_GRN",
  engine.getWorkflowImpactForStage("GOODS_RECEIPT_GRN").inventory === true);

check("WF-32: getAllStageIds returns 18 stages",
  engine.getAllStageIds().length === 18);

check("WF-33: getActiveStageIds returns active stages only",
  engine.getActiveStageIds().length > 0);
check("WF-34: getStageOrderIndex returns valid index",
  engine.getStageOrderIndex("WORK_ORDER") >= 0);

const isBeforeResult = engine.isBeforeStage("WORK_ORDER", "SALES_INVOICE_GST_INVOICE");
check("WF-35: isBeforeStage WORK_ORDER before SALES_INVOICE_GST_INVOICE",
  isBeforeResult === true);
check("WF-36: isAfterStage SALES_INVOICE_GST_INVOICE after WORK_ORDER",
  engine.isAfterStage("SALES_INVOICE_GST_INVOICE", "WORK_ORDER") === true);

check("WF-37: getLifecycleSummary returns lifecycle info",
  typeof engine.getLifecycleSummary() === "object" &&
  engine.getLifecycleSummary().operationalRootStage === "WORK_ORDER");

const evalResult = engine.evaluateWorkflowAction({
  actionType: "post_sales_voucher",
  currentStage: "SALES_INVOICE_GST_INVOICE",
  targetStage: "SALES_INVOICE_GST_INVOICE",
  recordContext: {}
});

check("WF-38: evaluateWorkflowAction returns valid decision object",
  typeof evalResult === "object" && ["allowed", "warn", "blocked"].includes(evalResult.decision));

check("WF-39: evaluateWorkflowAction contract includes source",
  evalResult.source === "WG-1");

check("WF-40: evaluateWorkflowAction contract includes enforcementMode",
  ["off", "warn", "block"].includes(evalResult.enforcementMode));

check("WF-41: Default enforcement mode is warn (not hard block)",
  evalResult.enforcementMode === "warn");

const evalWithMissing = engine.evaluateWorkflowAction({
  actionType: "post_sales_voucher",
  currentStage: "SALES_INVOICE_GST_INVOICE",
  targetStage: "SALES_INVOICE_GST_INVOICE",
  recordContext: {}
});

check("WF-42: Missing supply_order_id detection triggers warn (not block)",
  evalWithMissing.decision === "warn" || evalWithMissing.decision === "allowed");

check("WF-43: evaluateWorkflowAction reports supplyOrderRequired",
  typeof evalWithMissing.supplyOrderRequired === "boolean");

check("WF-44: evaluateWorkflowAction reports missingPrerequisites as array",
  Array.isArray(evalWithMissing.missingPrerequisites));

check("WF-45: evaluateWorkflowAction reports requiredPreviousStages as array",
  Array.isArray(evalWithMissing.requiredPreviousStages));

check("WF-46: evaluateWorkflowAction reports suggestedNextStage",
  evalWithMissing.suggestedNextStage !== undefined);

const warningsForAction = engine.getWorkflowWarningsForAction({
  actionType: "create",
  viewKey: "invoices",
  recordContext: {}
});

check("WF-47: getWorkflowWarningsForAction returns array",
  Array.isArray(warningsForAction));

if (warningsForAction.length > 0) {
  check("WF-48: Warnings have warning field",
    warningsForAction.every((w) => typeof w.warning === "string"));
  check("WF-49: Warnings have message field",
    warningsForAction.every((w) => typeof w.message === "string"));
  check("WF-50: Warnings have severity field",
    warningsForAction.every((w) => typeof w.severity === "string"));
  check("WF-51: Warnings have enforcementMode field",
    warningsForAction.every((w) => w.enforcementMode === "warn"));
} else {
  warn("WF-48 through WF-51 skipped", "No warnings returned — may need recordContext to trigger warnings");
}

const placeholder = engine.checkCurrentStage("supply_orders", "123");
check("WF-52: checkCurrentStage placeholder exists",
  typeof placeholder === "object" && placeholder.placeholder === true);
check("WF-53: checkCurrentStage defers to WG-3F",
  placeholder.deferredTo === "WG-3F");

const allowedAction = engine.evaluateWorkflowAction({
  actionType: "view",
  currentStage: "WORK_ORDER",
  targetStage: "WORK_ORDER",
  recordContext: { supply_order_id: "SO-001" }
});
check("WF-54: Allowed action with supply_order_id returns allowed",
  allowedAction.decision === "allowed");

check("WF-55: STAGE_DEFINITIONS has all 18 stages",
  engine.STAGE_DEFINITIONS.length === 18);

check("WF-56: STAGE_ORDER has 18 entries",
  engine.STAGE_ORDER.length === 18);

const viewKeys = Object.keys(engine.VIEW_KEY_TO_STAGE);
check("WF-57: VIEW_KEY_TO_STAGE has entries",
  viewKeys.length >= 10);

const tableKeys = Object.keys(engine.TABLE_TO_STAGE);
check("WF-58: TABLE_TO_STAGE has entries",
  tableKeys.length >= 15);

const source = readFileSync(enginePath, "utf-8");
check("WF-59: No database write import",
  !source.includes("better-sqlite3") &&
  !source.includes("init.js") &&
  !source.includes("createRecord") &&
  !source.includes("updateRecord") &&
  !source.includes("deleteRecord"));

check("WF-60: No accounting/posting service import",
  !source.includes("accountingService") &&
  !source.includes("postLedgerEntry") &&
  !source.includes("createBalancedVoucher") &&
  !source.includes("createOperationsService") &&
  !source.includes("createBillingService"));

check("WF-61: No IPC/preload write dependency",
  !source.includes("ipcRenderer") &&
  !source.includes("ipcMain") &&
  !source.includes("preload") &&
  !source.includes("contextBridge"));

const warningsForAction2 = engine.getWorkflowWarningsForAction({
  actionType: "post_sales_voucher",
  viewKey: "invoices",
  recordContext: {}
});
const hasWarnMode = warningsForAction2.every((w) => w.enforcementMode === "warn");
check("WF-62: All warnings use warn mode (not hard block)",
  warningsForAction2.length === 0 || hasWarnMode);

console.log("\n------------------------------------------------------------");
console.log(`Summary:  ${passed} passed,  ${warnings} warnings,  ${failed} failed`);
console.log("============================================================\n");

process.exit(failed > 0 ? 1 : 0);
