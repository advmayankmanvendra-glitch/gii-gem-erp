const IMPACT_NONE = ["No direct accounting, inventory or GST mutation occurs from reading this screen."];

const GROUP_PROFILES = {
  operations: {
    moduleName: "Operations",
    requiredFields: ["Current Company", "Order or source reference", "Party/department where applicable", "Date/status"],
    relatedActions: [
      { title: "Review Supply Orders", view: "supply_orders", detail: "Start with the order file." },
      { title: "Check Operations Dashboard", view: "operations_dashboard", detail: "Review stuck orders and exceptions." }
    ]
  },
  inventory: {
    moduleName: "Inventory",
    requiredFields: ["Current Company", "Item", "Warehouse", "Quantity", "Source document"],
    relatedActions: [
      { title: "Open Stock Summary", view: "stock_summary", detail: "Verify item balance." },
      { title: "Open Stock Ledger", view: "stock_ledger", detail: "Trace movements." }
    ]
  },
  accounting: {
    moduleName: "Accounting",
    requiredFields: ["Current Company", "Financial year", "Voucher date", "Posting status"],
    relatedActions: [
      { title: "Open Voucher Register", view: "voucher_register", detail: "Review posted/draft vouchers." },
      { title: "Open General Ledger", view: "ledger_view", detail: "Trace ledger impact." }
    ]
  },
  financial_control: {
    moduleName: "Financial Control",
    requiredFields: ["Current Company", "Financial year", "Status/reason", "Approval or lock state"],
    relatedActions: [
      { title: "Open Posting Queue", view: "posting_control", detail: "Review blocked or pending postings." },
      { title: "Open Audit Log", view: "audit_log", detail: "Trace user actions." }
    ]
  },
  receivables_payables: {
    moduleName: "Receivables & Payables",
    requiredFields: ["Current Company", "Party", "Invoice/bill", "Allocated amount", "Outstanding status"],
    relatedActions: [
      { title: "Open Party Ledger", view: "party_ledger", detail: "Compare party sub-ledger." },
      { title: "Open Outstanding Bills", view: "bill_outstanding", detail: "Review bill-wise balances." }
    ]
  },
  reports: {
    moduleName: "Reports",
    requiredFields: ["Current Company", "Period", "Report filters", "Print/export scope"],
    relatedActions: [
      { title: "Open Financial Reports", view: "reports", detail: "Review MIS report index." },
      { title: "Open Audit Log", view: "audit_log", detail: "Review source actions." }
    ]
  },
  utilities: {
    moduleName: "Utilities",
    requiredFields: ["Current Company", "Selected file/action", "Validation status", "Import/backup safety gate"],
    relatedActions: [
      { title: "Open ERP Health Center", view: "health_center", detail: "Check runtime and recovery status." },
      { title: "Open Settings", view: "settings", detail: "Review backup and updater tools." }
    ]
  }
};

const SCREEN_PROFILES = {
  supply_orders: {
    moduleName: "Supply Orders",
    keyFields: ["Order number", "Supply type", "Department", "Buyer/consignee", "Order item grid", "Delivery terms", "Documents"],
    requiredFields: ["Order number", "Department", "Order date", "Employee assigned", "At least one order item before procurement-pending or beyond"],
    accountingImpact: ["No ledger effect until linked billing, procurement, expense or voucher posting occurs."],
    inventoryImpact: ["Order item rows feed reservation, procurement requirement, stock issue and billing quantity checks."],
    gstImpact: ["GST rate on order items becomes the expected reference for billing and commercial review."],
    fieldsToCheck: ["Order identification is complete.", "Item grid totals match the government order value.", "Document and operational readiness warnings are reviewed."],
    commonMistakes: ["Saving a complete order without item rows.", "Using GeM fields for non-GeM orders.", "Billing before delivery and document readiness are checked."],
    recommendedNextAction: "Complete order items first, then review reservation, procurement and billing readiness.",
    relatedActions: [
      { title: "Open Order Items", view: "order_items", detail: "Verify item-wise status." },
      { title: "Create Procurement", view: "procurements", detail: "Procure pending quantities." },
      { title: "Raise Billing Voucher", view: "invoices", detail: "Bill only verified quantities." }
    ]
  },
  invoices: {
    moduleName: "Billing Voucher",
    keyFields: ["Order number", "Invoice number", "Department", "Item grid", "GST type", "Receivable summary", "Posting control"],
    requiredFields: ["Company", "Invoice number", "Invoice date", "Department", "Order number", "At least one invoice item"],
    accountingImpact: ["Posted sales voucher creates sales, output GST and trade receivable impact."],
    inventoryImpact: ["Billing should agree with issued or deliverable quantities; inventory reduction remains controlled by stock issue workflow."],
    gstImpact: ["CGST/SGST or IGST must match place of supply and GST type before posting."],
    fieldsToCheck: ["Invoice number sequence is correct.", "Item HSN/GST/rate/quantity are complete.", "Excess billing warnings are cleared or authorized with reason."],
    commonMistakes: ["Posting an invoice without checking order balance.", "Ignoring GST type/place of supply.", "Treating draft invoices as receivables."],
    recommendedNextAction: "Review the item grid, GST split and receivable summary before posting or printing.",
    relatedActions: [
      { title: "Open Receivables", view: "receivables", detail: "Check invoice outstanding." },
      { title: "Open GST Register", view: "gst_register", detail: "Verify tax impact." },
      { title: "Open Order Documents", view: "order_documents", detail: "Check document readiness." }
    ]
  },
  procurements: {
    moduleName: "Procurement",
    keyFields: ["Supplier", "Purchase invoice", "Linked order", "Items", "GST", "Freight/loading", "Warehouse"],
    requiredFields: ["Supplier", "Purchase date", "Purchase invoice number", "Item", "Quantity", "Rate"],
    accountingImpact: ["Posted purchase workflow creates purchase/input GST/payable impact where configured."],
    inventoryImpact: ["Procured quantities feed GRN, stock receipt and order fulfilment tracking."],
    gstImpact: ["Input GST depends on supplier invoice GST and item HSN/GST reference."],
    fieldsToCheck: ["Supplier and purchase invoice are correct.", "Procurement quantity does not exceed order requirement unless authorized.", "Warehouse/GRN status is ready for stock receipt."],
    commonMistakes: ["Procurement without linked order items.", "Wrong supplier GST details.", "Missing freight/loading allocation."],
    recommendedNextAction: "Verify supplier invoice and item quantities, then complete GRN or stock receipt.",
    relatedActions: [
      { title: "Open Goods Receipt Notes", view: "grn_report", detail: "Review received stock." },
      { title: "Open Payables", view: "payables", detail: "Check supplier outstanding." }
    ]
  },
  payments: {
    moduleName: "Payments",
    keyFields: ["Party type", "Party name", "Linked invoice/bill", "Bank account", "UTR", "TDS/GST TDS", "Allocation"],
    requiredFields: ["Payment date", "Amount", "Payment mode", "Bank account", "Party or linked record"],
    accountingImpact: ["Posted receipt/payment affects cash or bank ledger and receivable/payable allocation."],
    gstImpact: ["GST TDS deductions must be tracked separately from net bank receipt."],
    fieldsToCheck: ["Party and linked bill/invoice are selected.", "UTR is unique and bank account is correct.", "TDS, GST TDS and net receipt/payment reconcile."],
    commonMistakes: ["Recording payment without allocation.", "Putting deduction amount into bank receipt.", "Missing UTR/reference."],
    recommendedNextAction: "Allocate the payment against the correct invoice or supplier bill after saving.",
    relatedActions: [
      { title: "Open Receipt Allocation", view: "receipt_allocation_workflow", detail: "Allocate customer receipt." },
      { title: "Open Supplier Allocation", view: "supplier_allocation_workflow", detail: "Allocate supplier payment." }
    ]
  },
  documents: {
    moduleName: "Documents",
    keyFields: ["Linked module", "Linked record", "Document type", "Company", "File hash/status"],
    requiredFields: ["Company", "Linked module", "Document type", "File"],
    accountingImpact: IMPACT_NONE,
    inventoryImpact: ["Documents support operational readiness for delivery, billing, receipt and closure."],
    fieldsToCheck: ["Document is linked to the correct order/invoice/payment.", "Missing document list is reviewed.", "Uploaded file is visible in document management."],
    commonMistakes: ["Uploading a file without a linked record.", "Using the wrong document type.", "Assuming documents post accounting entries."],
    recommendedNextAction: "Attach missing order, invoice, delivery, CRAC and payment proof before closure.",
    relatedActions: [
      { title: "Open Missing Documents", view: "missing_documents", detail: "Check operational gaps." },
      { title: "Open Document Management", view: "documents", detail: "Review uploaded files." }
    ]
  },
  stock_summary: {
    moduleName: "Stock Summary",
    keyFields: ["Company", "Period", "Item", "Warehouse", "Closing quantity", "Closing value"],
    inventoryImpact: ["Shows stock value and quantity from existing inventory movements and valuation logic."],
    fieldsToCheck: ["Period and company filters are correct.", "Never-stocked item filter is intentional.", "Click item rows for ledger drilldown."],
    commonMistakes: ["Reading imported master items as live stock.", "Ignoring warehouse filter.", "Comparing values across different periods."],
    recommendedNextAction: "Open stock item ledger for the item whose value or quantity needs verification.",
    relatedActions: [
      { title: "Open Stock Ledger", view: "stock_ledger", detail: "Trace item-wise movements." },
      { title: "Open Low Stock", view: "low_stock", detail: "Review reorder exposure." }
    ]
  },
  voucher_dashboard: {
    moduleName: "Voucher Dashboard",
    keyFields: ["Voucher type", "Company", "Date", "Party/account", "Amount", "Narration"],
    requiredFields: ["Company", "Voucher date", "Voucher type", "Balanced debit/credit effect"],
    accountingImpact: ["Guided vouchers create accounting impact only after approval/posting workflow completes."],
    fieldsToCheck: ["Selected business voucher type is correct.", "Preview debit/credit lines balance.", "Posting status and audit trail are reviewed."],
    commonMistakes: ["Using journal voucher for routine business vouchers.", "Saving draft and expecting ledger impact.", "Posting to a locked financial year."],
    recommendedNextAction: "Use the guided voucher preview, then submit or post only after source evidence is checked.",
    relatedActions: [
      { title: "Open Voucher Register", view: "voucher_register", detail: "Find posted vouchers." },
      { title: "Open Trial Balance", view: "trial_balance", detail: "Check balanced books." }
    ]
  },
  tally_migration_assistant: {
    moduleName: "Tally Migration Assistant",
    keyFields: ["Company mapping", "Duplicate action", "Ledger classification", "Validation summary", "Import lock reason"],
    requiredFields: ["Company mapping approved", "Duplicate action selected", "Validation run", "Critical rows resolved or explicitly reviewed"],
    accountingImpact: ["Stage 1 imports master/reference data only; no live vouchers are posted."],
    inventoryImpact: ["Opening stock references stay staged and do not post stock ledger rows in this phase."],
    gstImpact: ["GST/HSN mapping quality affects later item and tax reporting accuracy."],
    fieldsToCheck: ["Import locked reason explains every blocker.", "Ledger review rows are resolved or marked reviewed.", "Validation summary separates valid, warning and failed rows."],
    commonMistakes: ["Importing into the wrong company.", "Treating reference-only ledgers as live balances.", "Skipping duplicate review."],
    recommendedNextAction: "Resolve ledger classification and run validation again before confirming import.",
    relatedActions: [
      { title: "Open Master Import Templates", view: "master_import_templates", detail: "Prepare clean data." },
      { title: "Open Item Master", view: "items", detail: "Review imported items." }
    ]
  },
  health_center: {
    moduleName: "ERP Health Center",
    keyFields: ["Runtime paths", "Database readiness", "Verification checks", "Support bundle", "Phase locks"],
    accountingImpact: IMPACT_NONE,
    fieldsToCheck: ["Runtime root and database path are correct.", "Failed checks are reviewed before continuing work.", "Support bundle excludes sensitive unnecessary data."],
    commonMistakes: ["Ignoring failed verification checks.", "Using browser preview for SQLite-connected workflows.", "Restoring backups without confirmation."],
    recommendedNextAction: "Refresh health checks, then open recovery guidance if any check fails.",
    relatedActions: [
      { title: "Open Settings", view: "settings", detail: "Create or restore backups." },
      { title: "Open Audit Log", view: "audit_log", detail: "Review critical actions." }
    ]
  }
};

const VIEW_ALIASES = {
  billing_voucher: "invoices",
  order_documents: "documents",
  invoice_documents: "documents",
  payment_documents: "documents",
  missing_documents: "documents",
  stock_ledger: "stock_summary",
  stock_valuation: "stock_summary",
  inventory_register: "stock_summary",
  tally_xml_import: "tally_migration_assistant"
};

/**
 * Enriches generic screen help with context-aware module guidance.
 */
function buildScreenHelpProfile(view, baseHelp = {}, navMeta = {}) {
  const groupProfile = GROUP_PROFILES[navMeta.groupId] || {};
  const screenProfile = SCREEN_PROFILES[view] || SCREEN_PROFILES[VIEW_ALIASES[view]] || {};
  return {
    ...baseHelp,
    ...groupProfile,
    ...screenProfile,
    viewKey: view,
    moduleName: screenProfile.moduleName || groupProfile.moduleName || navMeta.group || "ERP",
    keyFields: mergeLists(baseHelp.fieldExplanations, groupProfile.keyFields, screenProfile.keyFields),
    requiredFields: mergeLists(groupProfile.requiredFields, screenProfile.requiredFields),
    accountingImpact: mergeLists(baseHelp.accountingImpact, groupProfile.accountingImpact, screenProfile.accountingImpact),
    inventoryImpact: mergeLists(groupProfile.inventoryImpact, screenProfile.inventoryImpact),
    gstImpact: mergeLists(groupProfile.gstImpact, screenProfile.gstImpact),
    fieldsToCheck: mergeLists(groupProfile.fieldsToCheck, screenProfile.fieldsToCheck),
    relatedActions: mergeLists(groupProfile.relatedActions, screenProfile.relatedActions),
    relatedReports: mergeLists(baseHelp.relatedReports, groupProfile.relatedReports, screenProfile.relatedReports),
    relatedShortcuts: mergeLists(baseHelp.relatedShortcuts, groupProfile.relatedShortcuts, screenProfile.relatedShortcuts)
  };
}

/**
 * Merges arrays without losing object metadata.
 */
function mergeLists(...lists) {
  return lists.flatMap((list) => Array.isArray(list) ? list : list ? [list] : []).filter(Boolean);
}

export { buildScreenHelpProfile };
