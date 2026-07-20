const WG1_GRAPH = {
  lifecycleId: "GOVERNMENT_SUPPLY_LIFECYCLE",
  operationalRootStage: "WORK_ORDER",
  entryStage: "PURCHASE_ORDER_GEM_ORDER",
  closureStage: "ORDER_CLOSURE",
  reportingStage: "PROFITABILITY_ANALYSIS",
  accountingStartStages: ["SUPPLIER_PURCHASE_ORDER", "SALES_INVOICE_GST_INVOICE", "RECEIPT"],
  inventoryStartStages: ["GOODS_RECEIPT_GRN", "INVENTORY_RESERVATION", "DELIVERY_CHALLAN"],
  gstStartStages: ["SALES_INVOICE_GST_INVOICE", "SUPPLIER_PURCHASE_ORDER"]
};

const STAGE_DEFINITIONS = [
  { id: "LEAD_TENDER", label: "Lead / Tender", stageType: "lead", status: "active", upstreamDeps: [], downstreamDeps: ["QUERY_REQUIREMENT"], createsAccountingImpact: false, createsInventoryImpact: false, createsGSTImpact: false, allowedActions: ["create", "edit", "view", "list"], blockedActions: ["post", "reverse", "delete"] },
  { id: "QUERY_REQUIREMENT", label: "Query / Requirement", stageType: "lead", status: "active", upstreamDeps: ["LEAD_TENDER"], downstreamDeps: ["QUOTATION"], createsAccountingImpact: false, createsInventoryImpact: false, createsGSTImpact: false, allowedActions: ["create", "edit", "view", "list"], blockedActions: ["post", "reverse", "delete"] },
  { id: "QUOTATION", label: "Quotation", stageType: "lead", status: "active", upstreamDeps: ["QUERY_REQUIREMENT"], downstreamDeps: ["NEGOTIATION"], createsAccountingImpact: false, createsInventoryImpact: false, createsGSTImpact: false, allowedActions: ["create", "edit", "view", "list"], blockedActions: ["post", "reverse", "delete"] },
  { id: "NEGOTIATION", label: "Negotiation", stageType: "lead", status: "active", upstreamDeps: ["QUOTATION"], downstreamDeps: ["PURCHASE_ORDER_GEM_ORDER"], createsAccountingImpact: false, createsInventoryImpact: false, createsGSTImpact: false, allowedActions: ["create", "edit", "view", "list"], blockedActions: ["post", "reverse", "delete"] },
  { id: "PURCHASE_ORDER_GEM_ORDER", label: "Purchase Order / GeM Order", stageType: "procurement", status: "active", upstreamDeps: ["NEGOTIATION"], downstreamDeps: ["WORK_ORDER"], createsAccountingImpact: false, createsInventoryImpact: false, createsGSTImpact: false, allowedActions: ["create", "edit", "view", "list", "convert_to_work_order"], blockedActions: ["post", "reverse", "delete"] },
  { id: "WORK_ORDER", label: "Work Order / Supply Order", stageType: "fulfillment", status: "active", upstreamDeps: ["PURCHASE_ORDER_GEM_ORDER"], downstreamDeps: ["PROCUREMENT_PLANNING"], createsAccountingImpact: false, createsInventoryImpact: false, createsGSTImpact: false, allowedActions: ["create", "edit", "view", "list", "submit_for_approval", "approve"], blockedActions: ["post", "reverse", "delete", "create_ledger"] },
  { id: "PROCUREMENT_PLANNING", label: "Procurement Planning", stageType: "procurement", status: "active", upstreamDeps: ["WORK_ORDER"], downstreamDeps: ["SUPPLIER_PURCHASE_ORDER"], createsAccountingImpact: false, createsInventoryImpact: false, createsGSTImpact: false, allowedActions: ["create", "edit", "view", "list"], blockedActions: ["post", "reverse", "delete"] },
  { id: "SUPPLIER_PURCHASE_ORDER", label: "Supplier Purchase Orders", stageType: "procurement", status: "active", upstreamDeps: ["PROCUREMENT_PLANNING"], downstreamDeps: ["GOODS_RECEIPT_GRN"], createsAccountingImpact: true, createsInventoryImpact: false, createsGSTImpact: false, allowedActions: ["create", "edit", "view", "list", "post_purchase_voucher"], blockedActions: ["delete_after_posting"] },
  { id: "GOODS_RECEIPT_GRN", label: "Goods Receipt / GRN", stageType: "fulfillment", status: "active", upstreamDeps: ["SUPPLIER_PURCHASE_ORDER"], downstreamDeps: ["INVENTORY_RESERVATION"], createsAccountingImpact: false, createsInventoryImpact: true, createsGSTImpact: false, allowedActions: ["create", "edit", "view", "list", "post_stock_inward"], blockedActions: ["delete_after_posting"] },
  { id: "INVENTORY_RESERVATION", label: "Inventory Reservation", stageType: "fulfillment", status: "active", upstreamDeps: ["GOODS_RECEIPT_GRN"], downstreamDeps: ["DELIVERY_CHALLAN"], createsAccountingImpact: false, createsInventoryImpact: true, createsGSTImpact: false, allowedActions: ["reserve", "cancel_reservation", "view", "list"], blockedActions: ["post_ledger", "delete"] },
  { id: "DELIVERY_CHALLAN", label: "Delivery Challan", stageType: "delivery", status: "active", upstreamDeps: ["INVENTORY_RESERVATION"], downstreamDeps: ["INSTALLATION"], createsAccountingImpact: false, createsInventoryImpact: true, createsGSTImpact: false, allowedActions: ["create", "confirm", "view", "list", "post_stock_outward"], blockedActions: ["delete_after_confirmation"] },
  { id: "INSTALLATION", label: "Installation", stageType: "delivery", status: "active", upstreamDeps: ["DELIVERY_CHALLAN"], downstreamDeps: ["CRAC"], createsAccountingImpact: false, createsInventoryImpact: false, createsGSTImpact: false, allowedActions: ["create", "edit", "view", "list", "upload_document"], blockedActions: ["post", "reverse", "delete"] },
  { id: "CRAC", label: "CRAC", stageType: "delivery", status: "active", upstreamDeps: ["INSTALLATION"], downstreamDeps: ["SALES_INVOICE_GST_INVOICE"], createsAccountingImpact: false, createsInventoryImpact: false, createsGSTImpact: false, allowedActions: ["create", "edit", "view", "list", "generate_crac"], blockedActions: ["post_ledger"] },
  { id: "SALES_INVOICE_GST_INVOICE", label: "Sales Invoice / GST Invoice", stageType: "billing", status: "active", upstreamDeps: ["CRAC"], downstreamDeps: ["DEPARTMENT_RECEIVABLE"], createsAccountingImpact: true, createsInventoryImpact: true, createsGSTImpact: true, allowedActions: ["create", "edit", "view", "list", "post_sales_voucher", "print"], blockedActions: ["delete_after_posting", "reverse_without_approval"] },
  { id: "DEPARTMENT_RECEIVABLE", label: "Department Receivable", stageType: "financial", status: "active", upstreamDeps: ["SALES_INVOICE_GST_INVOICE"], downstreamDeps: ["RECEIPT"], createsAccountingImpact: true, createsInventoryImpact: false, createsGSTImpact: false, allowedActions: ["view", "list", "allocate_receipt", "reallocate"], blockedActions: ["create_direct", "delete", "post"] },
  { id: "RECEIPT", label: "Receipt", stageType: "financial", status: "active", upstreamDeps: ["DEPARTMENT_RECEIVABLE"], downstreamDeps: ["ORDER_CLOSURE"], createsAccountingImpact: true, createsInventoryImpact: false, createsGSTImpact: false, allowedActions: ["create", "edit", "view", "list", "post_receipt_voucher", "allocate"], blockedActions: ["delete_after_allocation", "reverse_without_approval"] },
  { id: "ORDER_CLOSURE", label: "Order Closure", stageType: "closure", status: "active", upstreamDeps: ["RECEIPT"], downstreamDeps: ["PROFITABILITY_ANALYSIS"], createsAccountingImpact: false, createsInventoryImpact: false, createsGSTImpact: false, allowedActions: ["view", "mark_closed", "generate_closure_report"], blockedActions: ["reopen_without_approval"] },
  { id: "PROFITABILITY_ANALYSIS", label: "Profitability Analysis", stageType: "analysis", status: "active", upstreamDeps: ["ORDER_CLOSURE"], downstreamDeps: [], createsAccountingImpact: false, createsInventoryImpact: false, createsGSTImpact: false, allowedActions: ["view", "export", "print"], blockedActions: ["post", "reverse", "delete"] }
];

const STAGE_ORDER = [
  "LEAD_TENDER", "QUERY_REQUIREMENT", "QUOTATION", "NEGOTIATION",
  "PURCHASE_ORDER_GEM_ORDER", "WORK_ORDER", "PROCUREMENT_PLANNING",
  "SUPPLIER_PURCHASE_ORDER", "GOODS_RECEIPT_GRN", "INVENTORY_RESERVATION",
  "DELIVERY_CHALLAN", "INSTALLATION", "CRAC",
  "SALES_INVOICE_GST_INVOICE", "DEPARTMENT_RECEIVABLE", "RECEIPT",
  "ORDER_CLOSURE", "PROFITABILITY_ANALYSIS"
];

const OPTIONAL_STAGES = new Set(["LEAD_TENDER", "QUERY_REQUIREMENT", "QUOTATION", "NEGOTIATION", "INSTALLATION"]);

const REQUIRED_EDGES = [
  { from: "PURCHASE_ORDER_GEM_ORDER", to: "WORK_ORDER", skipAllowed: false },
  { from: "WORK_ORDER", to: "PROCUREMENT_PLANNING", skipAllowed: true },
  { from: "PROCUREMENT_PLANNING", to: "SUPPLIER_PURCHASE_ORDER", skipAllowed: false },
  { from: "SUPPLIER_PURCHASE_ORDER", to: "GOODS_RECEIPT_GRN", skipAllowed: false },
  { from: "GOODS_RECEIPT_GRN", to: "INVENTORY_RESERVATION", skipAllowed: false },
  { from: "INVENTORY_RESERVATION", to: "DELIVERY_CHALLAN", skipAllowed: false },
  { from: "CRAC", to: "SALES_INVOICE_GST_INVOICE", skipAllowed: false },
  { from: "SALES_INVOICE_GST_INVOICE", to: "DEPARTMENT_RECEIVABLE", skipAllowed: false },
  { from: "DEPARTMENT_RECEIVABLE", to: "RECEIPT", skipAllowed: false },
  { from: "RECEIPT", to: "ORDER_CLOSURE", skipAllowed: false },
  { from: "ORDER_CLOSURE", to: "PROFITABILITY_ANALYSIS", skipAllowed: false }
];

const VIEW_KEY_TO_STAGE = {
  leads: "LEAD_TENDER",
  requirement_queries: "QUERY_REQUIREMENT",
  quotations: "QUOTATION",
  negotiations: "NEGOTIATION",
  supply_orders: "WORK_ORDER",
  order_items: "WORK_ORDER",
  procurements: "SUPPLIER_PURCHASE_ORDER",
  procurement_requirements: "PROCUREMENT_PLANNING",
  procurement_plans: "PROCUREMENT_PLANNING",
  supplier_purchase_orders: "SUPPLIER_PURCHASE_ORDER",
  grn_report: "GOODS_RECEIPT_GRN",
  stock_inwards: "GOODS_RECEIPT_GRN",
  stock_reservations: "INVENTORY_RESERVATION",
  delivery_challans: "DELIVERY_CHALLAN",
  stock_outwards: "DELIVERY_CHALLAN",
  installations: "INSTALLATION",
  installation: "INSTALLATION",
  crac_management: "CRAC",
  crac_entry: "CRAC",
  invoices: "SALES_INVOICE_GST_INVOICE",
  sales_invoices: "SALES_INVOICE_GST_INVOICE",
  receivables: "DEPARTMENT_RECEIVABLE",
  payments: "RECEIPT",
  payments_received: "RECEIPT",
  supplier_payments: "RECEIPT",
  receipt_allocation_workflow: "RECEIPT",
  order_closure_tracking: "ORDER_CLOSURE",
  profitability: "PROFITABILITY_ANALYSIS",
  purchase_orders: "PURCHASE_ORDER_GEM_ORDER",
  purchase_order: "PURCHASE_ORDER_GEM_ORDER"
};

const TABLE_TO_STAGE = {
  leads: "LEAD_TENDER",
  requirement_queries: "QUERY_REQUIREMENT",
  quotations: "QUOTATION",
  negotiations: "NEGOTIATION",
  supply_orders: "WORK_ORDER",
  order_items: "WORK_ORDER",
  procurements: "SUPPLIER_PURCHASE_ORDER",
  procurement_items: "SUPPLIER_PURCHASE_ORDER",
  procurement_plans: "PROCUREMENT_PLANNING",
  expense_entries: "PROCUREMENT_PLANNING",
  goods_receipts: "GOODS_RECEIPT_GRN",
  goods_receipt_items: "GOODS_RECEIPT_GRN",
  stock_inwards: "GOODS_RECEIPT_GRN",
  stock_reservations: "INVENTORY_RESERVATION",
  delivery_challans: "DELIVERY_CHALLAN",
  delivery_challan_items: "DELIVERY_CHALLAN",
  stock_outwards: "DELIVERY_CHALLAN",
  installations: "INSTALLATION",
  crac_records: "CRAC",
  invoices: "SALES_INVOICE_GST_INVOICE",
  invoice_items: "SALES_INVOICE_GST_INVOICE",
  sales_invoices: "SALES_INVOICE_GST_INVOICE",
  receivables: "DEPARTMENT_RECEIVABLE",
  payments: "RECEIPT",
  payment_allocations: "RECEIPT",
  supplier_payments: "RECEIPT",
  supplier_payment_allocations: "RECEIPT",
  purchase_orders: "PURCHASE_ORDER_GEM_ORDER"
};

const DEFAULT_ENFORCEMENT_MODE = "warn";

const STAGE_INDEX = Object.fromEntries(STAGE_ORDER.map((id, i) => [id, i]));

const STAGE_BY_ID = Object.fromEntries(STAGE_DEFINITIONS.map((s) => [s.id, s]));

function getWorkflowStageDefinition(stageId) {
  return STAGE_BY_ID[stageId] || null;
}

function getNextStages(stageId) {
  const def = STAGE_BY_ID[stageId];
  return def ? [...def.downstreamDeps] : [];
}

function getPreviousStages(stageId) {
  const def = STAGE_BY_ID[stageId];
  return def ? [...def.upstreamDeps] : [];
}

function isStageRequired(stageId) {
  return !OPTIONAL_STAGES.has(stageId) && STAGE_BY_ID[stageId] !== undefined;
}

function isStageOptional(stageId) {
  return OPTIONAL_STAGES.has(stageId);
}

function getOperationalRootStage() {
  return WG1_GRAPH.operationalRootStage;
}

function getWorkflowStageForView(viewKey) {
  return VIEW_KEY_TO_STAGE[viewKey] || null;
}

function getWorkflowStageForTable(tableName) {
  return TABLE_TO_STAGE[tableName] || null;
}

function getWorkflowImpactForStage(stageId) {
  const def = STAGE_BY_ID[stageId];
  if (!def) return { accounting: false, inventory: false, gst: false };
  return {
    accounting: def.createsAccountingImpact,
    inventory: def.createsInventoryImpact,
    gst: def.createsGSTImpact
  };
}

function getAllStageIds() {
  return [...STAGE_ORDER];
}

function getActiveStageIds() {
  return STAGE_DEFINITIONS.filter((s) => s.status === "active").map((s) => s.id);
}

function getStageOrderIndex(stageId) {
  return STAGE_INDEX[stageId] ?? -1;
}

function isBeforeStage(stageA, stageB) {
  const ai = STAGE_INDEX[stageA];
  const bi = STAGE_INDEX[stageB];
  if (ai === undefined || bi === undefined) return null;
  return ai < bi;
}

function isAfterStage(stageA, stageB) {
  const ai = STAGE_INDEX[stageA];
  const bi = STAGE_INDEX[stageB];
  if (ai === undefined || bi === undefined) return null;
  return ai > bi;
}

function getLifecycleSummary() {
  return {
    lifecycleId: WG1_GRAPH.lifecycleId,
    operationalRootStage: WG1_GRAPH.operationalRootStage,
    entryStage: WG1_GRAPH.entryStage,
    closureStage: WG1_GRAPH.closureStage,
    reportingStage: WG1_GRAPH.reportingStage,
    totalStages: STAGE_DEFINITIONS.length,
    activeStages: getActiveStageIds().length,
    stageOrder: [...STAGE_ORDER]
  };
}

const WORK_ORDER_ROOT_POLICY = Object.freeze({
  policy: "Work Order / Supply Order is the operational parent entity for the Government Supply Lifecycle.",
  implementationTable: "supply_orders",
  implementationRouteKey: "supply_orders",
  operationalRootStage: "WORK_ORDER",
  createsAccountingImpact: false,
  createsInventoryImpact: false,
  createsGSTImpact: false,
  downstreamCommercialRecordsMustReference: "supply_order_id",
  linkageEnforcementIn: "WG-3D",
  wg3aDetectionOnly: true,
  ruleReferences: [
    "docs/architecture/work-order-parent-entity-rule.md",
    "WG-1 workflow-graph.json: operationalRootStage=WORK_ORDER",
    "DG-1 database-graph.json: supply_orders.createsAccountingImpact=false",
    "KG-4 voucher-accounting-graph: WORK_ORDER no direct accounting impact",
    "FF-1 feature-function-graph: FEA-11 Work Order / Supply Order is operational root"
  ]
});

function getWorkOrderRootPolicy() {
  return { ...WORK_ORDER_ROOT_POLICY };
}

function evaluateWorkflowAction({ actionType, currentStage, targetStage, recordContext }) {
  const currentDef = STAGE_BY_ID[currentStage];
  const targetDef = STAGE_BY_ID[targetStage];

  const result = {
    decision: "allowed",
    stageId: currentStage || targetStage || null,
    actionType: actionType || null,
    reason: "",
    requiredPreviousStages: [],
    missingPrerequisites: [],
    operationalRootRequired: false,
    supplyOrderRequired: false,
    accountingImpact: false,
    inventoryImpact: false,
    gstImpact: false,
    suggestedNextStage: null,
    source: "WG-1",
    enforcementMode: DEFAULT_ENFORCEMENT_MODE
  };

  if (!currentDef && !targetDef) {
    result.decision = "allowed";
    result.reason = "Unknown stage — no workflow enforcement applicable.";
    return result;
  }

  const def = targetDef || currentDef;
  result.accountingImpact = def.createsAccountingImpact;
  result.inventoryImpact = def.createsInventoryImpact;
  result.gstImpact = def.createsGSTImpact;
  result.requiredPreviousStages = [...def.upstreamDeps];

  const hasSupplyOrderId = recordContext && recordContext.supply_order_id;
  const hasOrderId = recordContext && recordContext.order_id;

  if (def.createsAccountingImpact && !hasOrderId && !hasSupplyOrderId) {
    result.supplyOrderRequired = true;
    result.decision = "warn";
    result.reason = `Action "${actionType}" on stage "${def.id}" creates accounting impact but no Work Order / Supply Order linkage detected.`;
  }

  if (currentStage && targetStage && currentStage !== targetStage && def.upstreamDeps.length > 0) {
    const required = REQUIRED_EDGES.filter((e) => e.to === def.id && !e.skipAllowed);
    const missing = required.filter((e) => {
      const fromIdx = STAGE_INDEX[e.from];
      const curIdx = STAGE_INDEX[currentStage];
      if (fromIdx === undefined || curIdx === undefined) return true;
      return curIdx < fromIdx;
    }).map((e) => e.from);
    result.missingPrerequisites = missing;
    if (missing.length > 0) {
      result.decision = "warn";
      result.reason = `Stage "${def.id}" requires previous stage(s): ${missing.join(", ")}. ${result.reason || ""}`.trim();
    }
  }

  if (def.id !== "WORK_ORDER" && def.status === "active" && !hasSupplyOrderId && !hasOrderId) {
    result.operationalRootRequired = true;
    if (result.decision === "allowed") {
      result.decision = "warn";
      result.reason = `Record on stage "${def.id}" has no operational root (Work Order / Supply Order) linkage.`;
    }
  }

  if (def.downstreamDeps.length > 0) {
    result.suggestedNextStage = def.downstreamDeps[0];
  }

  return result;
}

function getWorkflowWarningsForAction(actionContext) {
  const warnings = [];
  const { actionType, viewKey, tableName, recordContext, currentStage } = actionContext || {};

  const stageId = currentStage || getWorkflowStageForView(viewKey) || getWorkflowStageForTable(tableName);
  if (!stageId) return warnings;

  const hasSupplyOrderId = recordContext && (recordContext.supply_order_id || recordContext.order_id);
  const hasInvoiceId = recordContext && recordContext.invoice_id;
  const hasReceivableId = recordContext && recordContext.receivable_id;
  const hasReservationData = recordContext && recordContext.reservation_id;

  if (actionType === "create" || actionType === "post_sales_voucher" || actionType === "post_receipt_voucher") {
    if (!hasSupplyOrderId && stageId !== "WORK_ORDER" && stageId !== "PROCUREMENT_PLANNING") {
      warnings.push({
        warning: "missing_work_order_linkage",
        stageId,
        message: `Creating a record on stage "${stageId}" without a linked Work Order / Supply Order. Root linkage recommended.`,
        severity: "info",
        enforcementMode: DEFAULT_ENFORCEMENT_MODE
      });
    }
  }

  if (stageId === "SALES_INVOICE_GST_INVOICE" && actionType === "create" && !hasSupplyOrderId) {
    warnings.push({
      warning: "invoice_without_work_order",
      stageId,
      message: "Creating invoice without Work Order / Supply Order linkage. Downstream traceability will be missing.",
      severity: "info",
      enforcementMode: DEFAULT_ENFORCEMENT_MODE
    });
  }

  if (stageId === "RECEIPT" && actionType === "post_receipt_voucher" && !hasInvoiceId && !hasReceivableId) {
    warnings.push({
      warning: "receipt_without_invoice_linkage",
      stageId,
      message: "Receipt voucher without linked invoice or receivable. Allocation may be incomplete.",
      severity: "info",
      enforcementMode: DEFAULT_ENFORCEMENT_MODE
    });
  }

  if (stageId === "DELIVERY_CHALLAN" && actionType === "create" && !hasReservationData) {
    warnings.push({
      warning: "delivery_without_reservation",
      stageId,
      message: "Delivery Challan without confirmed inventory reservation. Stock availability not verified.",
      severity: "info",
      enforcementMode: DEFAULT_ENFORCEMENT_MODE
    });
  }

  if (stageId === "CRAC" && actionType === "create" && !hasSupplyOrderId) {
    warnings.push({
      warning: "crac_without_work_order",
      stageId,
      message: "CRAC record without linked Work Order. Acceptance evidence cannot be traced to an order.",
      severity: "info",
      enforcementMode: DEFAULT_ENFORCEMENT_MODE
    });
  }

  if (stageId === "PROFITABILITY_ANALYSIS" && actionType === "view") {
    warnings.push({
      warning: "profitability_without_closure_check",
      stageId,
      message: "Profitability analysis should be based on closed orders with all posted transactions.",
      severity: "info",
      enforcementMode: DEFAULT_ENFORCEMENT_MODE
    });
  }

  if (viewKey === "voucher_dashboard" && !hasSupplyOrderId) {
    warnings.push({
      warning: "voucher_dashboard_without_work_order_context",
      stageId: null,
      message: "Voucher Dashboard opened without Work Order context. Consider starting from Work Order / Supply Order.",
      severity: "info",
      enforcementMode: DEFAULT_ENFORCEMENT_MODE
    });
  }

  if (stageId === "GOODS_RECEIPT_GRN" && actionType === "create" && !hasSupplyOrderId) {
    warnings.push({
      warning: "grn_without_purchase_order_linkage",
      stageId,
      message: "GRN without linked purchase order. Goods receipt traceability to procurement is missing.",
      severity: "info",
      enforcementMode: DEFAULT_ENFORCEMENT_MODE
    });
  }

  return warnings;
}

function checkCurrentStage(entityType, entityId) {
  return {
    placeholder: true,
    note: "checkCurrentStage is a read-only placeholder in WG-3A. Live stage lookup requires WG-3F Help Assistant integration.",
    entityType,
    entityId,
    description: "Returns the current workflow stage of an entity by querying its stage-related fields.",
    deferredTo: "WG-3F"
  };
}

export {
  getWorkflowStageDefinition,
  getNextStages,
  getPreviousStages,
  isStageRequired,
  isStageOptional,
  getOperationalRootStage,
  getWorkflowStageForView,
  getWorkflowStageForTable,
  getWorkflowImpactForStage,
  getAllStageIds,
  getActiveStageIds,
  getStageOrderIndex,
  isBeforeStage,
  isAfterStage,
  getLifecycleSummary,
  getWorkOrderRootPolicy,
  evaluateWorkflowAction,
  getWorkflowWarningsForAction,
  checkCurrentStage,
  STAGE_DEFINITIONS,
  STAGE_ORDER,
  VIEW_KEY_TO_STAGE,
  TABLE_TO_STAGE,
  WG1_GRAPH,
  WORK_ORDER_ROOT_POLICY
};
