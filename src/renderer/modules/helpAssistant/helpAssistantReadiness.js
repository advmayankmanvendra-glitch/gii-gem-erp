function firstNumber(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function getNestedNumber(source, paths) {
  for (const path of paths) {
    const value = String(path || "").split(".").reduce((current, key) => current?.[key], source);
    const numeric = firstNumber(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function statusFromCount(count, label = "record") {
  if (count === null || count === undefined) {
    return {
      status: "Review",
      tone: "warning",
      detail: `${label} count is not loaded in the safe summary yet. Open the related module to verify.`
    };
  }
  if (Number(count) > 0) {
    return {
      status: "Ready",
      tone: "success",
      detail: `${count} ${label}${Number(count) === 1 ? "" : "s"} found.`
    };
  }
  return {
    status: "Missing",
    tone: "danger",
    detail: `No ${label}s found. Create or import this master before live operations.`
  };
}

function buildCheck({ title, count, label, view, actionLabel, required = true, detail }) {
  const computed = required ? statusFromCount(count, label) : {
    status: count ? "Ready" : "Optional",
    tone: count ? "success" : "info",
    detail: detail || "Optional setup item."
  };
  return {
    title,
    count,
    view,
    actionLabel,
    status: computed.status,
    tone: computed.tone,
    detail: detail || computed.detail
  };
}

function buildOnboardingReadiness({ companies = [], companyContext = {}, stats = {} } = {}) {
  const counts = stats?.counts || {};
  const accounting = stats?.accounting || {};
  const inventory = stats?.inventory || {};
  const companyCount = firstNumber(companies.length, counts.companies, counts.companyCount);
  const currentCompanyReady = Boolean(companyContext?.company_id || companyContext?.company_name);
  const bankCount = firstNumber(counts.banks, counts.bankCount, accounting.banks?.length);
  const warehouseCount = firstNumber(counts.warehouses, counts.warehouseCount, inventory.warehouses?.length, inventory.references?.warehouses?.length);
  const itemCount = firstNumber(counts.items, counts.itemCount, inventory.items?.length);
  const supplierCount = firstNumber(counts.suppliers, counts.supplierCount);
  const departmentCount = firstNumber(counts.departments, counts.departmentCount);
  const accountCount = firstNumber(counts.accounts, counts.accountCount, accounting.accounts?.length);
  const orderCount = firstNumber(counts.totalOrders, counts.orders, counts.supplyOrders, counts.orderCount);
  const invoiceCount = firstNumber(counts.invoices, counts.billing, counts.invoiceCount, counts.billings);
  const paymentCount = firstNumber(counts.paymentsReceived, counts.payments, counts.receipts, counts.paymentCount);

  const sections = [
    {
      title: "Company Setup",
      description: "Company context must be selected before live work.",
      checks: [
        buildCheck({
          title: "Company Master",
          count: companyCount,
          label: "company",
          view: "companies",
          actionLabel: "Open Companies",
          detail: currentCompanyReady
            ? `Current company: ${companyContext.company_name || "Selected company"}.`
            : "Create and select a company before transactions."
        })
      ]
    },
    {
      title: "Core Masters",
      description: "These masters make order, procurement, billing and payment entry reliable.",
      checks: [
        buildCheck({ title: "Departments / Customers", count: departmentCount, label: "department", view: "government_departments", actionLabel: "Open Departments" }),
        buildCheck({ title: "Suppliers", count: supplierCount, label: "supplier", view: "suppliers", actionLabel: "Open Suppliers" }),
        buildCheck({ title: "Items", count: itemCount, label: "item", view: "items", actionLabel: "Open Items" }),
        buildCheck({ title: "Bank Accounts", count: bankCount, label: "bank account", view: "banks", actionLabel: "Open Banks" }),
        buildCheck({ title: "Warehouses", count: warehouseCount, label: "warehouse", view: "warehouses", actionLabel: "Open Warehouses" })
      ]
    },
    {
      title: "Accounting Readiness",
      description: "These checks keep posting and reports controlled.",
      checks: [
        buildCheck({ title: "Chart of Accounts", count: accountCount, label: "ledger account", view: "chart_accounts", actionLabel: "Open Chart of Accounts" }),
        buildCheck({
          title: "Financial Controls",
          count: null,
          label: "financial control",
          view: "financial_control",
          actionLabel: "Review Controls",
          detail: "Review financial years, opening balances and locked-year controls before production posting."
        }),
        buildCheck({
          title: "Backup Safety",
          count: null,
          label: "backup",
          view: "settings",
          actionLabel: "Open Settings",
          detail: "Create a backup before bulk import, migration or production posting."
        })
      ]
    },
    {
      title: "Workflow Start",
      description: "After masters are ready, start with order entry and progress through operations.",
      checks: [
        buildCheck({ title: "Supply Orders", count: orderCount, label: "order", view: "supply_orders", actionLabel: "Create Supply Order", required: false }),
        buildCheck({ title: "Billing", count: invoiceCount, label: "invoice", view: "invoices", actionLabel: "Open Billing", required: false }),
        buildCheck({ title: "Payments", count: paymentCount, label: "payment", view: "payments", actionLabel: "Open Payments", required: false })
      ]
    }
  ];

  const allChecks = sections.flatMap((section) => section.checks);
  const blocking = allChecks.filter((check) => check.tone === "danger");
  const review = allChecks.filter((check) => check.tone === "warning");
  const ready = allChecks.filter((check) => check.tone === "success");
  const suggestedActions = [...blocking, ...review].slice(0, 6).map((check) => ({
    title: check.actionLabel || check.title,
    detail: check.detail,
    view: check.view,
    tone: check.tone
  }));

  return {
    sections,
    suggestedActions,
    summary: {
      ready: ready.length,
      review: review.length,
      blocking: blocking.length,
      total: allChecks.length
    },
    sourceLabel: "Current company context and safe dashboard summary counts"
  };
}

function buildCoachPriorities({ readiness, stats = {}, companyContext = {} } = {}) {
  const counts = stats?.counts || {};
  const accounting = stats?.accounting || {};
  const inventory = stats?.inventory || {};
  const priorities = [];

  const missingCompany = !companyContext?.company_id && companyContext?.company_scope !== "all";
  if (missingCompany) {
    priorities.push({
      severity: "Critical",
      title: "Select a Current Company",
      detail: "Transactions and reports should not be reviewed without a selected company context.",
      actionLabel: "Open Companies",
      view: "companies"
    });
  }

  (readiness?.suggestedActions || []).slice(0, 3).forEach((action) => {
    priorities.push({
      severity: action.tone === "danger" ? "Critical" : "Warning",
      title: action.title,
      detail: action.detail,
      actionLabel: action.title,
      view: action.view
    });
  });

  const pendingBilling = getNestedNumber(counts, ["pendingBilling", "ordersPendingBilling", "billingPending", "pending_billing"]);
  const pendingCollection = getNestedNumber(counts, ["outstanding", "receivablesOutstanding", "pendingCollection", "receivables"]);
  const lowStock = getNestedNumber(counts, ["lowStockItems", "lowStock", "inventory.lowStockItems"]);
  const unpostedVouchers = firstNumber(counts.unpostedVouchers, accounting.postingQueue?.length, accounting.voucherProposals?.length);
  const pendingApproval = firstNumber(counts.pendingApproval, accounting.approvalQueue?.length);

  if (pendingBilling && pendingBilling > 0) {
    priorities.push({
      severity: "Warning",
      title: "Orders pending billing",
      detail: `${pendingBilling} order${pendingBilling === 1 ? "" : "s"} may need invoice review.`,
      actionLabel: "Open Billing",
      view: "invoices"
    });
  }
  if (pendingCollection && pendingCollection > 0) {
    priorities.push({
      severity: "Warning",
      title: "Receivables need collection review",
      detail: `Outstanding receivable summary shows ${pendingCollection}. Verify bill-wise receivables and allocations.`,
      actionLabel: "Open Receivables",
      view: "receivables"
    });
  }
  if (lowStock && lowStock > 0) {
    priorities.push({
      severity: "Information",
      title: "Low stock items need attention",
      detail: `${lowStock} item${lowStock === 1 ? "" : "s"} appear in the safe inventory summary.`,
      actionLabel: "Open Low Stock",
      view: "low_stock"
    });
  }
  if (unpostedVouchers && unpostedVouchers > 0) {
    priorities.push({
      severity: "Warning",
      title: "Unposted voucher queue",
      detail: `${unpostedVouchers} voucher${unpostedVouchers === 1 ? "" : "s"} may need review before reports are final.`,
      actionLabel: "Open Posting Queue",
      view: "posting_control"
    });
  }
  if (pendingApproval && pendingApproval > 0) {
    priorities.push({
      severity: "Warning",
      title: "Approvals pending",
      detail: `${pendingApproval} approval item${pendingApproval === 1 ? "" : "s"} need authorized review.`,
      actionLabel: "Open Approval Queue",
      view: "approval_queue"
    });
  }

  if (!priorities.length) {
    priorities.push({
      severity: "Information",
      title: "No urgent safe-summary issues detected",
      detail: "Continue with supply order entry, procurement, billing, receipt allocation and periodic backups.",
      actionLabel: "Open Dashboard",
      view: "dashboard"
    });
  }

  return {
    priorities: priorities.slice(0, 8),
    sourceLabel: "Safe summary data only; no records are modified"
  };
}

function answerReadOnlyDataQuestion({ query, stats = {} } = {}) {
  const normalized = String(query || "").toLowerCase();
  const counts = stats?.counts || {};
  const accounting = stats?.accounting || {};
  const inventory = stats?.inventory || {};

  if (!normalized.trim()) {
    return {
      title: "Read-only Data Mode",
      summary: "Ask a safe summary question such as outstanding receivables, GST payable, low stock, pending approvals or unposted vouchers.",
      steps: [
        "This phase answers only from safe summary objects already loaded by the ERP shell.",
        "It does not run SQL, write records, post vouchers or call mutation APIs.",
        "Detailed row-level questions will require the future read-only Data Assistant API phase."
      ],
      sourceLabel: "No data query submitted",
      limitation: "Detailed row-level data lookup is intentionally blocked in H1-H5."
    };
  }

  if (normalized.includes("gst")) {
    const gst = accounting.gstSummary || {};
    const output = firstNumber(gst.outputGst, gst.output_gst, counts.outputGst);
    const input = firstNumber(gst.inputGst, gst.input_gst, counts.inputGst);
    const net = firstNumber(gst.netGstPayable, gst.net_gst_payable, counts.netGstPayable);
    if ([output, input, net].some((value) => value !== null)) {
      return {
        title: "GST summary from safe data",
        summary: `Output GST: ${formatPlainAmount(output)}; Input GST: ${formatPlainAmount(input)}; Net GST payable: ${formatPlainAmount(net)}.`,
        steps: ["Open GST Summary for the formal report.", "Verify only posted vouchers are included.", "Review GST Register before filing decisions."],
        sourceLabel: "Safe accounting summary object",
        limitation: ""
      };
    }
  }

  if (normalized.includes("receivable") || normalized.includes("outstanding") || normalized.includes("unpaid invoice")) {
    const outstanding = firstNumber(counts.outstanding, counts.receivablesOutstanding, counts.receivables, accounting.receivables?.length);
    if (outstanding !== null) {
      return {
        title: "Receivable summary from safe data",
        summary: `Safe summary value/count available: ${formatPlainAmount(outstanding)}. Use Bill-wise Receivable and Party Ledger for invoice-level verification.`,
        steps: ["Open Receivables.", "Drill into Bill-wise Receivable.", "Match receipt allocations before treating an invoice as closed."],
        sourceLabel: "Safe dashboard/accounting summary object",
        limitation: ""
      };
    }
  }

  if (normalized.includes("payable") || normalized.includes("supplier")) {
    const payable = firstNumber(counts.payablesOutstanding, counts.payables, accounting.payables?.length);
    if (payable !== null) {
      return {
        title: "Payable summary from safe data",
        summary: `Safe payable value/count available: ${formatPlainAmount(payable)}. Use Bill-wise Payable and Supplier Ledger for bill-level verification.`,
        steps: ["Open Payables.", "Review supplier bill allocation.", "Verify payment vouchers and supplier ledger before closure."],
        sourceLabel: "Safe dashboard/accounting summary object",
        limitation: ""
      };
    }
  }

  if (normalized.includes("low stock") || normalized.includes("stock")) {
    const lowStock = firstNumber(counts.lowStockItems, counts.lowStock, inventory.lowStock?.length);
    const stockValue = firstNumber(counts.totalStockValue, counts.stockValue, inventory.summary?.stockValue);
    if (lowStock !== null || stockValue !== null) {
      return {
        title: "Inventory summary from safe data",
        summary: `Low stock items: ${formatPlainAmount(lowStock)}; Stock value: ${formatPlainAmount(stockValue)}.`,
        steps: ["Open Stock Summary for value verification.", "Open Low Stock for reorder review.", "Use Stock Ledger for movement-level audit."],
        sourceLabel: "Safe dashboard/inventory summary object",
        limitation: ""
      };
    }
  }

  return {
    title: "This data question needs the read-only Data Assistant API phase",
    summary: "The H1-H5 assistant is allowed to answer guidance and safe summary questions only. It cannot inspect arbitrary live records yet.",
    steps: [
      "Use the relevant report screen for record-level details.",
      "Open ledger, bill-wise report, stock ledger or voucher register for drilldown.",
      "A later read-only Data Assistant API can safely answer richer data questions without write access."
    ],
    sourceLabel: "Safety boundary",
    limitation: "No unrestricted SQL or live mutation API calls are allowed in this phase."
  };
}

function formatPlainAmount(value) {
  if (value === null || value === undefined || value === "") return "not loaded";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export { answerReadOnlyDataQuestion, buildCoachPriorities, buildOnboardingReadiness };
