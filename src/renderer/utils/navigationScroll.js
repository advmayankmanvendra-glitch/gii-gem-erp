/** Return likely scroll containers used by the ERP shell. */
function getScrollContainers() {
  if (typeof document === "undefined") return [];
  return [
    document.scrollingElement,
    document.documentElement,
    document.body,
    document.querySelector(".workspace"),
    document.querySelector(".screen-host")
  ].filter(Boolean);
}

const SECTION_SCROLL_TARGETS = {
  entry: '#transaction-entry-form, #supply-order-entry-form, #billing-voucher-form',
  form: '#transaction-entry-form, #supply-order-entry-form, #billing-voucher-form',
  items: '#billing-items-section, #supply-order-entry-form, .operations-evidence-card',
  documents: '.document-checklist, .document-center, .report-panel',
  posting: '.posting-control-panel, .report-panel',
  ledger: '.voucher-detail-panel, .drilldown-panel, .report-panel',
  audit: '.voucher-detail-panel, .drilldown-panel, .report-panel',
  report: '.report-panel, .table-wrap',
  drilldown: '.operations-drilldown-panel, .voucher-detail-panel, .drilldown-panel',
  command: '.operations-command-center'
};

const VIEW_SECTION_TARGETS = {
  supply_orders: {
    entry: '#supply-order-entry-form',
    form: '#supply-order-entry-form',
    list: '#supply-order-list-panel',
    items: '#supply-order-entry-form'
  },
  invoices: {
    entry: '#billing-voucher-form',
    form: '#billing-voucher-form',
    items: '#billing-items-section',
    validation: '#billing-order-validation',
    list: '#billing-invoice-list'
  },
  documents: {
    documents: '.report-panel',
    report: '.report-panel'
  },
  ledger_view: {
    ledger: '.report-panel'
  },
  gst_register: {
    drilldown: '.voucher-detail-panel',
    ledger: '.voucher-detail-panel',
    report: '.report-panel'
  },
  stock_ledger: {
    ledger: '.report-panel'
  },
  audit_log: {
    audit: '.report-panel'
  }
};

/** Reset visible ERP workspace scroll positions after route navigation. */
export function resetWorkspaceScroll() {
  getScrollContainers().forEach((container) => {
    try {
      container.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
      if ("scrollTop" in container) container.scrollTop = 0;
      if ("scrollLeft" in container) container.scrollLeft = 0;
    } catch {
      // Some browser-provided scroll elements reject object syntax; direct assignment above remains safe.
    }
  });
}

/** Resolve a section target for route-aware or same-page navigation actions. */
export function resolveNavigationScrollTarget(view, context = {}) {
  if (!context) return null;
  if (context.scrollTarget || context.targetSelector) return context.scrollTarget || context.targetSelector;
  const section = context.section || context.targetSection;
  if (!section) return context.focusDefault ? (VIEW_SECTION_TARGETS[view]?.entry || SECTION_SCROLL_TARGETS.report) : null;
  return VIEW_SECTION_TARGETS[view]?.[section] || SECTION_SCROLL_TARGETS[section] || null;
}

/** Scroll after a navigation action when the caller knows the relevant section. */
export function scrollToNavigationTarget(view, context = {}) {
  const target = resolveNavigationScrollTarget(view, context);
  if (!target) return false;
  scrollToSection(target, context.focus !== false);
  return true;
}

/** Smooth-scroll to a target section and optionally focus its first useful control. */
export function scrollToSection(selector, focus = true) {
  window.setTimeout(() => {
    const target = typeof selector === "string" ? document.querySelector(selector) : selector;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    if (focus) {
      const input = target.querySelector?.('input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"]), button');
      window.setTimeout(() => input?.focus?.({ preventScroll: true }), 220);
    }
  }, 50);
}
