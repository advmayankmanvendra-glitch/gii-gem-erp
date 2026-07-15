const BOUNDARY_RULES = {
  accounting: {
    domains: ["voucher_accounting"],
    boundary: "accounting-sensitive",
    notice: "Guidance only. I explain the ERP accounting process but cannot post, reverse, approve, or alter vouchers or ledger entries. Verify the actual result in the relevant ERP screen or report before taking action.",
    rules: [
      "Accounting impact must flow through controlled posting functions (createBalancedVoucher).",
      "Work Order / Supply Order has no direct accounting impact.",
      "Trial Balance, Profit & Loss, and Balance Sheet derive from ledger_entries.",
      "Financial year lock blocks posting in locked years."
    ]
  },
  database: {
    domains: ["database_table"],
    boundary: "database-sensitive",
    notice: "Guidance only. I explain database tables and relationships but cannot query live records or modify schema. Open the relevant screen or report to see actual data.",
    rules: [
      "Generic CRUD is blocked for accounting-protected tables.",
      "Live record values are not accessible through this assistant."
    ]
  },
  inventory: {
    domains: ["inventory"],
    boundary: "inventory-sensitive",
    notice: "Guidance only. I explain stock flow and process but cannot create inward, outward, adjustment, or valuation entries. Use the relevant inventory screen for stock operations.",
    rules: [
      "Stock movement must use controlled inventory posting functions.",
      "Inventory valuation affects COGS and profitability."
    ]
  },
  gst: {
    domains: ["gst_tax"],
    boundary: "gst-sensitive",
    notice: "Guidance only. I explain GST process and report sources but cannot certify tax compliance, file returns, or calculate statutory obligations. Consult a tax professional for compliance decisions.",
    rules: [
      "GST registers derive from posted invoices and vouchers.",
      "E-way bill and e-invoice generation are separate controlled processes."
    ]
  },
  workflow: {
    domains: ["workflow"],
    boundary: "workflow-sensitive",
    notice: "Guidance only. I explain workflow stage dependencies and sequence but cannot bypass governance rules or alter workflow status.",
    rules: [
      "Workflow stages must follow the approved lifecycle order.",
      "Work Order / Supply Order is operational root — no direct accounting impact."
    ]
  },
  importExport: {
    domains: [],
    boundary: "import-sensitive",
    notice: "Guidance only. I explain the import/export process but cannot trigger file import, export, or data migration. Use the controlled Import/Export module.",
    rules: [
      "Import requires staging/preview before live data insertion.",
      "Export is available through the relevant report or screen."
    ]
  }
};

function enforceSafety(category, searchResults) {
  const catId = category?.category || "unknown";
  const safetyFlags = category?.safetyFlags || {};

  if (catId === "unsafe_action") {
    return {
      boundary: "action-refused",
      notice: "I cannot perform this action. I am a read-only guidance assistant.",
      rules: ["No posting, reversal, approval, deletion, import, export, or command execution."],
      requiresNotice: true
    };
  }

  for (const rule of Object.values(BOUNDARY_RULES)) {
    if (rule.domains.includes(catId)) {
      return {
        boundary: rule.boundary,
        notice: rule.notice,
        rules: rule.rules,
        requiresNotice: true
      };
    }
  }

  const hasAccountingSource = (searchResults?.results || []).some(
    (r) => r.sourceKind === "voucher-accounting-graph"
  );
  if (hasAccountingSource && !safetyFlags.isAccountingSensitive) {
    return {
      boundary: "accounting-sensitive",
      notice: BOUNDARY_RULES.accounting.notice,
      rules: BOUNDARY_RULES.accounting.rules,
      requiresNotice: true
    };
  }

  return {
    boundary: "read-only guidance",
    notice: "I provide sourced guidance based on locked ERP knowledge. No live data access or record mutation is possible.",
    rules: [],
    requiresNotice: false
  };
}

function getSafetyNotice(boundary) {
  for (const rule of Object.values(BOUNDARY_RULES)) {
    if (rule.boundary === boundary) return rule.notice;
  }
  return null;
}

export { enforceSafety, getSafetyNotice, BOUNDARY_RULES };
