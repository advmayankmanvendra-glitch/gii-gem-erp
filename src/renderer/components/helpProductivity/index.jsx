import React, { useEffect, useState } from "react";
import { keyboardGuideSections } from "../../config/helpContent.js";
import { flatNavItems, inventoryReportViews, viewTitles } from "../../config/navigation.js";
import { masterViews, transactionViews } from "../../config/viewDefinitions.js";
import { buildScreenHelpProfile } from "../../modules/helpAssistant/screenHelpCatalog.js";
import { safeArray, safeObject } from "../../stability/rendererStabilityUtils.js";
import { formatCurrency } from "../../utils/formatters.js";
import { HelpList } from "../helpTraining/index.jsx";

export function ContextShortcutPanel({ view, role, stats, collapsed, onToggle, onAction, onLearn }) {
  const [shortcutQuery, setShortcutQuery] = useState("");
  const screenTitle = viewTitles[view]?.[0] || masterViews[view]?.title || transactionViews[view]?.title || "ERP Screen";
  const groups = safeArray(shortcutGroupsForView(view));
  const quickActions = safeArray(quickActionsForView(view, role));
  const liveStats = safeArray(productivityStatsForView(view, stats));
  const tasks = safeArray(pendingTasksForView(view, stats));
  const shortcutNeedle = shortcutQuery.trim().toLowerCase();
  const filteredGroups = shortcutNeedle ? groups
    .map((group) => ({
      ...group,
      items: safeArray(group.items).filter(([keys, label]) => `${keys} ${label}`.toLowerCase().includes(shortcutNeedle))
    }))
    .filter((group) => safeArray(group.items).length) : groups;
  return (
    <section className={`shortcut-context-panel productivity-panel ${collapsed ? "collapsed" : ""}`} aria-label="Context productivity panel">
      <button type="button" className="shortcut-panel-head" onClick={onToggle} title={collapsed ? "Show productivity panel" : "Hide productivity panel"}>
        <span>{collapsed ? "> Productivity" : "Productivity"}</span>
        <strong>{collapsed ? "+" : "-"}</strong>
      </button>
      {!collapsed && (
        <div className="shortcut-panel-body">
          <div className="productivity-current-screen">
            <span>Current Screen</span>
            <strong>{screenTitle}</strong>
          </div>
          <label className="productivity-search">
            <span>Search Shortcut</span>
            <input value={shortcutQuery} onChange={(event) => setShortcutQuery(event.target.value)} placeholder="invoice, ledger, print..." />
          </label>
          {filteredGroups.map((group) => (
            <div className="shortcut-panel-group" key={group.title}>
              <span>{group.title}</span>
              <div>
                {safeArray(group.items).map(([keys, label]) => (
                  <p key={`${group.title}-${keys}`}>
                    <kbd>{keys}</kbd>
                    <small>{label}</small>
                  </p>
                ))}
              </div>
            </div>
          ))}
          {!filteredGroups.length && <p className="productivity-muted">No shortcuts match this search.</p>}
          <div className="productivity-section">
            <span>Quick Actions</span>
            <div className="productivity-actions">
              {quickActions.map((action) => (
                <button type="button" key={action.label} onClick={() => onAction(action)} disabled={action.disabled} title={action.disabled ? "Hidden by role or unavailable on this screen" : action.label}>
                  {action.label}
                </button>
              ))}
            </div>
          </div>
          <div className="productivity-section">
            <span>Live Statistics</span>
            <div className="productivity-stats">
              {liveStats.map(([label, value]) => <p key={label}><small>{label}</small><strong>{value}</strong></p>)}
            </div>
          </div>
          <div className="productivity-section">
            <span>Pending Tasks</span>
            <div className="productivity-tasks">
              {tasks.map((task) => <p key={task}>{task}</p>)}
            </div>
          </div>
          <button type="button" className="learn-screen-btn" onClick={onLearn}>Learn This Screen</button>
        </div>
      )}
    </section>
  );
}

export function ProductivityLearnDialog({ view, onClose, onOpenTraining }) {
  const help = helpForView(view);
  const shortcuts = shortcutGroupsForView(view).flatMap((group) => group.items.map(([keys, label]) => `${keys} - ${label}`));
  const related = relatedModulesForView(view);
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="help-dialog productivity-learn-dialog" role="dialog" aria-modal="true">
        <div className="panel-head">
          <div>
            <h2>{help.title}</h2>
            <p>{help.description}</p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>Close</button>
        </div>
        <div className="help-columns">
          <HelpList title="Purpose" items={[help.description]} />
          <HelpList title="Workflow" items={workflowForView(view)} />
        </div>
        <div className="help-columns">
          <HelpList title="Common Mistakes" items={help.commonMistakes} />
          <HelpList title="Related Modules" items={related} />
        </div>
        <div className="help-columns">
          <HelpList title="Available Shortcuts" items={shortcuts} />
          <HelpList title="Business Tips" items={businessTipsForView(view)} />
        </div>
        <div className="help-columns">
          <HelpList title="Accounting Impact" items={help.accountingImpact} />
          <HelpList title="Related Reports" items={help.relatedReports} />
        </div>
        <div className="confirm-actions">
          <button type="button" className="ghost-btn" onClick={onOpenTraining}>Open Training Mode</button>
          <button type="button" className="primary-btn" onClick={onClose}>Understood</button>
        </div>
      </section>
    </div>
  );
}

function shortcutGroupsForView(view) {
  const navigationItems = safeArray(flatNavItems);
  const meta = navigationItems.find((item) => item.key === view) || {};
  const groupId = meta.groupId;
  const groups = [];
  if (view === "supply_orders") {
    groups.push({
      title: "Supply Orders",
      items: [["F2", "New Order"], ["F3", "Edit Order"], ["F4", "View Order"], ["F6", "Generate Procurement"], ["F7", "Reserve Stock"], ["F8", "Generate Invoice"]]
    });
  } else if (groupId === "inventory" || inventoryReportViews.has(view) || ["stock_inwards", "stock_outwards", "stock_adjustments", "stock_returns"].includes(view)) {
    groups.push({
      title: "Inventory",
      items: [["F2", "Stock Receipt"], ["F3", "Stock Issue"], ["F4", "Stock Transfer"], ["F5", "Stock Adjustment"]]
    });
  } else if (groupId === "accounting" || view === "voucher_dashboard" || view === "manual_voucher") {
    groups.push({
      title: "Accounting",
      items: [["Alt+R", "Receipt Voucher"], ["Alt+P", "Payment Voucher"], ["Alt+S", "Sales Voucher"], ["Alt+U", "Purchase Voucher"], ["Alt+J", "Journal Voucher"]]
    });
  } else if (groupId === "reports" || ["reports", "cash_flow", "gst", "receivables", "payables"].includes(view)) {
    groups.push({
      title: "Reports",
      items: [["Ctrl+P", "Print"], ["Ctrl+E", "Export"], ["Ctrl+F", "Search"], ["Ctrl+R", "Refresh"]]
    });
  }
  groups.push({
    title: "Always",
    items: [["Ctrl+S", "Save"], ["Esc", "Exit"], ["F1", "Help"]]
  });
  return groups;
}

export function productivityScopeForView(view) {
  const meta = safeArray(flatNavItems).find((item) => item.key === view) || {};
  if (view === "supply_orders") return "supply_orders";
  if (meta.groupId === "inventory" || inventoryReportViews.has(view)) return "inventory";
  if (meta.groupId === "accounting" || view === "voucher_dashboard" || view === "manual_voucher") return "accounting";
  if (["receivables", "department_ledger", "bill_wise_receivables", "receivable_ageing"].includes(view)) return "receivables";
  if (["payables", "supplier_ledger", "bill_wise_payables", "payable_ageing"].includes(view)) return "payables";
  if (meta.groupId === "reports" || ["reports", "cash_flow", "gst", "gst_reports", "outstanding_reports", "profitability_reports", "employee_reports"].includes(view)) return "reports";
  return meta.groupId || "general";
}

export function roleAllowsAction(role, actionScope) {
  const normalized = String(role || "admin").toLowerCase();
  if (normalized.includes("read")) return false;
  if (normalized.includes("admin")) return true;
  if (normalized.includes("approver")) return !["new", "voucher", "inventory"].includes(actionScope);
  if (normalized.includes("inventory")) return actionScope === "inventory" || actionScope === "report";
  if (normalized.includes("account")) return actionScope === "voucher" || actionScope === "receivable" || actionScope === "payable" || actionScope === "report";
  return true;
}

function quickActionsForView(view, role) {
  const scope = productivityScopeForView(view);
  const actionSets = {
    supply_orders: [
      { label: "New Order", type: "new", view: "supply_orders", scope: "new" },
      { label: "Edit Order", type: "navigate", view: "supply_orders", scope: "new" },
      { label: "Reserve Stock", type: "new", view: "stock_reservations", scope: "inventory" },
      { label: "Generate Procurement", type: "new", view: "procurements", scope: "new" },
      { label: "Generate Invoice", type: "new", view: "invoices", scope: "voucher" },
      { label: "Print Order", type: "print", scope: "report" }
    ],
    inventory: [
      { label: "Stock Receipt", type: "new", view: "stock_inwards", scope: "inventory" },
      { label: "Stock Issue", type: "new", view: "stock_outwards", scope: "inventory" },
      { label: "Stock Transfer", type: "new", view: "warehouse_transfers", scope: "inventory" },
      { label: "Stock Adjustment", type: "new", view: "stock_adjustments", scope: "inventory" },
      { label: "Reservations", type: "navigate", view: "stock_reservations", scope: "inventory" }
    ],
    accounting: [
      { label: "Receipt Voucher", type: "voucher", kind: "receipt", scope: "voucher" },
      { label: "Payment Voucher", type: "voucher", kind: "supplier_payment", scope: "voucher" },
      { label: "Sales Voucher", type: "voucher", kind: "sales", scope: "voucher" },
      { label: "Purchase Voucher", type: "voucher", kind: "purchase", scope: "voucher" },
      { label: "Journal Voucher", type: "voucher", kind: "journal", targetView: "manual_voucher", scope: "voucher" },
      { label: "Contra Voucher", type: "voucher", kind: "contra", scope: "voucher" }
    ],
    receivables: [
      { label: "New Receipt", type: "new", view: "payments", scope: "receivable" },
      { label: "Allocation", type: "navigate", view: "receipt_allocation_workflow", scope: "receivable" },
      { label: "Party Ledger", type: "navigate", view: "department_ledger", scope: "report" },
      { label: "Ageing Report", type: "navigate", view: "receivable_ageing", scope: "report" }
    ],
    payables: [
      { label: "Supplier Payment", type: "voucher", kind: "supplier_payment", scope: "payable" },
      { label: "Allocation", type: "navigate", view: "supplier_allocation_workflow", scope: "payable" },
      { label: "Supplier Ledger", type: "navigate", view: "supplier_ledger", scope: "report" },
      { label: "Ageing Report", type: "navigate", view: "payable_ageing", scope: "report" }
    ],
    reports: [
      { label: "Refresh", type: "refresh", scope: "report" },
      { label: "Export", type: "export", scope: "report" },
      { label: "Print", type: "print", scope: "report" },
      { label: "PDF", type: "pdf", scope: "report" },
      { label: "Audit Log", type: "navigate", view: "audit_log", scope: "report" }
    ]
  };
  const actions = safeArray(actionSets[scope] || actionSets.reports);
  return actions.map((action) => ({ ...action, disabled: !roleAllowsAction(role, action.scope) }));
}

function productivityStatsForView(view, stats) {
  const scope = productivityScopeForView(view);
  const safeStats = safeObject(stats);
  const counts = safeObject(safeStats.counts);
  const accounting = safeObject(safeStats.accounting);
  const inventory = safeObject(safeStats.inventory);
  const rows = {
    supply_orders: [
      ["Open Orders", counts.activeOrders ?? 0],
      ["Pending Procurement", Math.max(0, Number(counts.activeOrders || 0))],
      ["Pending Supply", counts.totalOrders ?? 0],
      ["Pending Billing", formatCurrency(counts.outstanding || 0)]
    ],
    inventory: [
      ["Stock Value", formatCurrency(counts.totalStockValue || 0)],
      ["Reserved Stock", safeArray(inventory.reservations).length || 0],
      ["Low Stock Items", counts.lowStockItems ?? 0],
      ["Pending Deliveries", safeArray(inventory.deliveryChallans).filter((row) => row.status !== "Confirmed").length || 0]
    ],
    accounting: [
      ["Unposted Vouchers", safeArray(accounting.postingControl).length || 0],
      ["Pending Approval", safeArray(accounting.approvalQueue).filter((row) => row.status !== "Approved").length || 0],
      ["Reversed Vouchers", safeArray(accounting.vouchers).filter((row) => row.status === "Reversed").length || 0],
      ["Draft Vouchers", safeArray(accounting.guidedVouchers).filter((row) => row.status === "Draft").length || 0]
    ],
    receivables: [
      ["Outstanding Amount", formatCurrency(safeArray(accounting.billWiseReceivables || accounting.receivables).reduce((sum, row) => sum + Number(row.balance_outstanding || row.outstanding || 0), 0))],
      ["Overdue Invoices", safeArray(accounting.receivableAgeing).filter((row) => String(row.age_bucket || "").includes("90") || row.status === "Overdue").length || 0],
      ["Receipts Today", safeArray(accounting.payments).filter((row) => row.payment_date === todayIso()).length || 0]
    ],
    payables: [
      ["Outstanding Payables", formatCurrency(safeArray(accounting.billWisePayables || accounting.payables).reduce((sum, row) => sum + Number(row.balance_due || 0), 0))],
      ["Overdue Supplier Bills", safeArray(accounting.payableAgeing).filter((row) => String(row.age_bucket || "").includes("90") || row.status === "Overdue").length || 0],
      ["Payments Today", safeArray(accounting.supplierPayments).filter((row) => row.payment_date === todayIso()).length || 0]
    ],
    reports: [
      ["Available Reports", safeArray(flatNavItems).filter((item) => item.groupId === "reports").length],
      ["Last Refresh Time", safeStats.refreshedAt || "-"]
    ]
  };
  return rows[scope] || rows.reports;
}

function pendingTasksForView(view, stats) {
  const scope = productivityScopeForView(view);
  const safeStats = safeObject(stats);
  const counts = safeObject(safeStats.counts);
  const accounting = safeObject(safeStats.accounting);
  const inventory = safeObject(safeStats.inventory);
  const tasks = {
    supply_orders: [
      `${Number(counts.activeOrders || 0)} order(s) need active follow-up`,
      `${formatCurrency(counts.outstanding || 0)} billing/collection exposure to review`
    ],
    inventory: [
      `${Number(counts.lowStockItems || 0)} low-stock item(s) need attention`,
      `${safeArray(inventory.inwards).filter((row) => row.posting_status !== "Posted").length || 0} stock receipt(s) pending posting`
    ],
    accounting: [
      `${safeArray(accounting.approvalQueue).length || 0} approval item(s) pending`,
      `${safeArray(accounting.postingControl).length || 0} posting control item(s) pending`
    ],
    receivables: [
      `${safeArray(accounting.receivableAgeing).length || 0} receivable ageing row(s) to review`
    ],
    payables: [
      `${safeArray(accounting.payableAgeing).length || 0} payable ageing row(s) to review`
    ],
    reports: [
      "Refresh report data before export or print"
    ]
  };
  return tasks[scope] || ["No urgent task configured for this screen."];
}

function workflowForView(view) {
  const scope = productivityScopeForView(view);
  if (scope === "supply_orders") return ["Order", "Reservation", "Procurement", "Delivery", "Billing", "Receipt"];
  if (scope === "inventory") return ["Procurement", "Stock Receipt", "Reservation", "Delivery Challan", "Stock Issue", "COGS Review"];
  if (scope === "accounting") return ["Draft Voucher", "Review", "Approval", "Posting", "Ledger", "Reports"];
  if (scope === "receivables") return ["Invoice", "Receipt", "TDS/GST TDS", "Allocation", "Outstanding Review"];
  if (scope === "payables") return ["Purchase Bill", "Supplier Payment", "Allocation", "Outstanding Review"];
  return ["Open Screen", "Filter", "Review", "Export or Print"];
}

function relatedModulesForView(view) {
  const scope = productivityScopeForView(view);
  const related = {
    supply_orders: ["Procurement", "Inventory", "Billing", "Receivables", "Profitability"],
    inventory: ["Items", "Warehouses", "Procurement", "Delivery Challans", "COGS"],
    accounting: ["Voucher Dashboard", "General Ledger", "Trial Balance", "Approval Queue", "Audit Log"],
    receivables: ["Billing", "Payments", "Department Ledger", "Receipt Allocation"],
    payables: ["Procurement", "Supplier Ledger", "Supplier Allocation", "Payment Voucher"],
    reports: ["Financial Reports", "GST Reports", "Outstanding Reports", "Audit Log"]
  };
  return related[scope] || ["Dashboard", "Reports", "Help & Training"];
}

function businessTipsForView(view) {
  const scope = productivityScopeForView(view);
  const tips = {
    supply_orders: ["Do not invoice before supply status and documents are checked.", "Keep one clean order number across procurement, billing and payment."],
    inventory: ["Avoid stock issue before inward/posting is verified.", "Use transfer instead of adjustment when stock moves between locations."],
    accounting: ["Use guided vouchers for routine transactions.", "Reverse posted entries instead of editing them directly."],
    receivables: ["Allocate receipts against invoices promptly.", "Track TDS and GST TDS separately from cash receipts."],
    payables: ["Match supplier payments against purchase invoices.", "Review overdue bills before fresh procurement."],
    reports: ["Refresh before export.", "Print reports only after checking filters and financial year."]
  };
  return tips[scope] || ["Use search and help when unsure.", "Review status badges before taking action."];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function ShortcutHelpDialog({ onClose }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape" || event.key === "F1") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  const groups = keyboardGuideSections;
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="shortcut-help-dialog" role="dialog" aria-modal="true">
        <div className="panel-head">
          <div>
            <h2>Keyboard Shortcuts</h2>
            <p>Complete keyboard guide for desktop ERP operation, Smart Enter flow and module-specific shortcuts.</p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>Close</button>
        </div>
        <div className="shortcut-grid">
          {groups.map(([title, rows]) => (
            <div className="shortcut-group" key={title}>
              <h3>{title}</h3>
              {rows.map(([keys, action]) => <div className="shortcut-row" key={keys}><kbd>{keys}</kbd><span>{action}</span></div>)}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function UserPreferencesDialog({ onClose, compactSidebar }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape" || event.key === "F12") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="shortcut-help-dialog" role="dialog" aria-modal="true">
        <div className="panel-head">
          <div>
            <h2>User Preferences</h2>
            <p>Desktop productivity preferences for this session.</p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>Close</button>
        </div>
        <div className="shortcut-grid">
          <div className="shortcut-group">
            <h3>Keyboard Layer</h3>
            <div className="shortcut-row"><kbd>F12</kbd><span>Open or close this preferences panel.</span></div>
            <div className="shortcut-row"><kbd>F1</kbd><span>Open the full keyboard shortcut guide.</span></div>
          </div>
          <div className="shortcut-group">
            <h3>Current Session</h3>
            <div className="shortcut-row"><kbd>Sidebar</kbd><span>{compactSidebar ? "Compact mode enabled" : "Expanded mode enabled"}</span></div>
            <div className="shortcut-row"><kbd>Safety</kbd><span>Posting, reversal, delete and restore actions still require confirmation.</span></div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function FirstTimeTour({ onClose, onOpenHelp }) {
  const steps = [
    ["Start with masters", "Add companies, employees, departments, suppliers, items, warehouses, expense heads and banks before entering transactions."],
    ["Run the order workflow", "Create a supply order, reserve stock, procure shortages, receive stock, issue delivery, bill, collect payment and review profitability."],
    ["Post with control", "Accounting-impacting actions use approval, posting, reversal and audit controls. Posted records should not be edited directly."],
    ["Use keyboard speed", "Press F1 for shortcuts. Enter moves through forms, Ctrl+K opens global search and Esc uses safe confirmations."],
    ["Train safely", "Use Training Mode for sample scenarios. It is guidance-only and does not write live accounting data."]
  ];
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="help-dialog first-tour" role="dialog" aria-modal="true">
        <div className="panel-head">
          <div>
            <h2>Welcome to GII GeM ERP</h2>
            <p>A quick guided tour for first-time users.</p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>Close</button>
        </div>
        <div className="tour-steps">
          {steps.map(([title, note], index) => (
            <article className="tour-step" key={title}>
              <strong>{index + 1}</strong>
              <div><h3>{title}</h3><p>{note}</p></div>
            </article>
          ))}
        </div>
        <div className="confirm-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>Start Working</button>
          <button type="button" className="primary-btn" onClick={onOpenHelp}>Open Help & Training</button>
        </div>
      </section>
    </div>
  );
}

export function ContextHelpDialog({ view, onClose, onOpenTraining }) {
  const help = helpForView(view);
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="help-dialog" role="dialog" aria-modal="true">
        <div className="panel-head">
          <div>
            <h2>{help.title}</h2>
            <p>{help.description}</p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>Close</button>
        </div>
        <div className="help-columns">
          <HelpList title="How to use" items={help.howToUse} />
          <HelpList title="Common mistakes" items={help.commonMistakes} />
        </div>
        <div className="help-columns">
          <HelpList title="Accounting Impact" items={help.accountingImpact} />
          <HelpList title="Field Explanations" items={help.fieldExplanations} />
        </div>
        <div className="help-columns">
          <HelpList title="Best Practices" items={help.bestPractices} />
          <HelpList title="Related Reports" items={help.relatedReports} />
        </div>
        <div className="help-callout">
          <strong>Safe ERP rule</strong>
          <span>{help.safetyRule}</span>
        </div>
        <div className="confirm-actions">
          <button type="button" className="ghost-btn" onClick={onOpenTraining}>Open Training Mode</button>
          <button type="button" className="primary-btn" onClick={onClose}>Understood</button>
        </div>
      </section>
    </div>
  );
}

export function matchesHelpQuery(values, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.flatMap((value) => Array.isArray(value) ? value : [value]).some((value) => String(value || "").toLowerCase().includes(needle));
}

export function helpForView(view) {
  const title = viewTitles[view]?.[0] || masterViews[view]?.title || transactionViews[view]?.title || "ERP Screen";
  const description = viewTitles[view]?.[1] || masterViews[view]?.description || transactionViews[view]?.description || "Use this screen to review or manage ERP records.";
  const meta = flatNavItems.find((item) => item.key === view) || {};
  const group = meta.groupId || "general";
  const base = {
    key: view,
    viewKey: view,
    title,
    description,
    howToUse: [
      "Check company, date, party and status filters before reviewing data.",
      "Use search to find records quickly.",
      "Use Help, shortcuts and global search when you are unsure where to go."
    ],
    commonMistakes: [
      "Using incomplete master data before transactions.",
      "Skipping review before posting or approving.",
      "Ignoring status badges and outstanding balances."
    ],
    safetyRule: "Review source document, amount, GST, party and date before saving or posting.",
    workflow: ["Open the screen from the sidebar or global search.", "Review filters, status and current records.", "Create or open a record, validate evidence, then save or post only where permitted."],
    accountingImpact: ["May affect operational reports. Accounting impact applies only when the source record is posted through approved workflow."],
    fieldExplanations: ["Company/financial year control ownership and period.", "Date drives period, ageing, GST and reporting.", "Status and posting fields show whether the record is draft, approved, posted, reversed or blocked."],
    bestPractices: ["Use clean master data.", "Attach source documents.", "Use reversal/correction instead of editing posted records."],
    relatedReports: ["Audit Log", "Posting Queue", "Financial Reports"],
    relatedShortcuts: shortcutGroupsForView(view).flatMap((group) => group.items.map(([keys, label]) => `${keys} ${label}`))
  };

  if (group === "masters") {
    base.howToUse = ["Create clean master data before transactions.", "Keep inactive records instead of deleting used masters.", "Validate GSTIN, PAN, bank account and contact details."];
    base.commonMistakes = ["Duplicate supplier or department names.", "Wrong GSTIN/PAN format.", "Deleting masters already used in transactions."];
    base.safetyRule = "Master errors flow into vouchers, GST reports and party ledgers.";
    base.workflow = ["Create master record.", "Validate tax, bank and status fields.", "Use inactive status for old records used in transactions."];
    base.accountingImpact = ["Masters do not directly post ledgers, but wrong masters cause wrong party ledgers, GST reports and payment mapping."];
    base.fieldExplanations = ["Name/code identifies the party or item.", "GSTIN/PAN support tax compliance.", "Status controls whether record should be used in new transactions."];
    base.bestPractices = ["Avoid duplicate parties and items.", "Keep bank details verified.", "Use searchable naming conventions."];
    base.relatedReports = ["Party Ledger", "GST Reports", "Audit Log"];
  }
  if (group === "operations") {
    base.howToUse = ["Start from supply order and complete procurement, billing, payment and documents in sequence.", "Use order number consistently.", "Post only after source documents are verified."];
    base.commonMistakes = ["Billing before procurement/stock review.", "Missing UTR or invoice number.", "Uploading documents without linking record/module."];
    base.safetyRule = "Operations can affect receivables, payables, inventory and profitability.";
    base.workflow = ["Supply order creates the business reference.", "Procurement, stock receipt, billing, payment and documents complete the order file.", "Review posting status and profitability before closure."];
    base.accountingImpact = ["Procurement can create purchase/payable/input GST.", "Billing can create sales/receivable/output GST.", "Payments can affect bank/cash and receivables.", "Expenses affect profitability and expense ledgers after posting."];
    base.fieldExplanations = ["Order number ties all operational and accounting records.", "Party, invoice and UTR fields support ledger reconciliation.", "Remarks should explain unusual deductions, documents or approval points."];
    base.bestPractices = ["Do not bill before stock and documents are verified.", "Allocate receipts bill-wise.", "Attach supply order, invoice, delivery and payment evidence."];
    base.relatedReports = ["Order Profitability", "Receivables", "Payables", "Posting Queue", "Missing Documents"];
  }
  if (group === "inventory") {
    base.howToUse = ["Receive stock before issue.", "Use warehouse, item, quantity and rate carefully.", "Review stock ledger and valuation after posting."];
    base.commonMistakes = ["Issuing unavailable stock.", "Wrong warehouse selection.", "Using adjustments instead of proper inward/outward workflow."];
    base.safetyRule = "Stock actions can affect inventory quantity, valuation and COGS.";
    base.workflow = ["Reserve stock for order.", "Receive stock through GRN/stock inward.", "Issue stock through delivery/stock outward.", "Review stock ledger and valuation."];
    base.accountingImpact = ["Stock inward/outward can affect inventory and COGS depending on posting workflow.", "Stock valuation feeds dashboard and inventory reports."];
    base.fieldExplanations = ["Item and warehouse define stock location.", "Quantity and rate affect balance and valuation.", "Serial/batch fields support traceability."];
    base.bestPractices = ["Verify physical receipt before posting.", "Avoid negative stock.", "Use adjustments only with approval and reason."];
    base.relatedReports = ["Stock Summary", "Stock Ledger", "Stock Valuation", "COGS Report", "Reservation Ageing"];
  }
  if (group === "accounting" || group === "financial_control") {
    base.howToUse = ["Use guided vouchers for routine entries.", "Use manual journal only for accountant-approved adjustments.", "Reverse posted vouchers instead of editing them."];
    base.commonMistakes = ["Posting to wrong financial year.", "Unbalanced manual journal lines.", "Using journal entries to bypass business workflow."];
    base.safetyRule = "No posting, reversal, approval or year close should happen without review and confirmation.";
    base.workflow = ["Review source record.", "Approve where required.", "Post voucher to books.", "Use drilldown to ledger, source and audit trail."];
    base.accountingImpact = ["Posted vouchers update ledgers, trial balance, books, GST, receivables/payables or cash/bank depending on voucher type."];
    base.fieldExplanations = ["Voucher date controls period.", "Debit and credit must balance.", "Source module/reference keeps audit evidence intact."];
    base.bestPractices = ["Prefer business vouchers over manual journal.", "Use clear narration.", "Never delete posted records directly."];
    base.relatedReports = ["Voucher Register", "General Ledger", "Trial Balance", "Day Book", "Audit Log"];
  }
  if (group === "receivables_payables") {
    base.howToUse = ["Allocate receipts and supplier payments bill-wise.", "Record TDS and GST TDS separately.", "Review ageing before follow-up/payment."];
    base.commonMistakes = ["Leaving payments unallocated.", "Mixing TDS with bank receipt amount.", "Ignoring old outstanding bills."];
    base.safetyRule = "Party ledger and outstanding reports depend on correct allocations.";
    base.workflow = ["Review open bills.", "Record receipt/payment.", "Allocate bill-wise with deductions.", "Review party ledger and ageing."];
    base.accountingImpact = ["Allocations reconcile party sub-ledgers with accounting ledgers and outstanding reports."];
    base.fieldExplanations = ["Allocated amount reduces specific bill.", "TDS/GST TDS are deductions, not bank receipt amount.", "Due date and days outstanding drive ageing."];
    base.bestPractices = ["Allocate immediately after payment entry.", "Keep deduction proof attached.", "Review old outstanding weekly."];
    base.relatedReports = ["Bill-wise Receivable", "Bill-wise Payable", "Party Ledger", "Receivable Ageing", "Payable Ageing"];
  }
  if (group === "tax") {
    base.howToUse = ["Review input GST, output GST, TDS and GST TDS by period.", "Match tax reports with invoices, purchases and receipts.", "Export before filing or accountant review."];
    base.commonMistakes = ["Using wrong GST rate.", "Not recording GST TDS deduction.", "Reviewing GST before posting all vouchers."];
    base.safetyRule = "Tax reports are only as accurate as posted vouchers and bill-wise deductions.";
    base.workflow = ["Post purchases, invoices and receipts.", "Review GST/TDS registers.", "Match against ledgers and export for filing review."];
    base.accountingImpact = ["Tax reports depend on posted source vouchers and deduction allocations."];
    base.fieldExplanations = ["GST rate determines output/input tax.", "GST type determines CGST/SGST or IGST treatment.", "TDS/GST TDS should match payment deductions."];
    base.bestPractices = ["Review tax monthly.", "Do not file from draft data.", "Keep invoices and payment proofs linked."];
    base.relatedReports = ["GST Register", "GST Summary", "TDS Register", "GST TDS Reconciliation"];
  }
  if (view === "help_training") {
    base.howToUse = ["Start Training Mode for sample guidance.", "Use Business Workflow Guide for order lifecycle.", "Use FAQ and troubleshooting before changing data."];
    base.commonMistakes = ["Practicing in live transaction screens.", "Skipping module help before posting.", "Confusing training sample with live data."];
    base.safetyRule = "Training Mode is guidance-only and does not write live accounting data.";
    base.workflow = ["Search for the topic.", "Read manual or context help.", "Practice with training mode before live entry."];
    base.accountingImpact = ["Help and Training has no accounting impact."];
    base.fieldExplanations = ["Help Search finds screens, reports, fields, workflows and shortcuts.", "Training Mode is guidance-only.", "PDF export uses print preview."];
    base.bestPractices = ["Use role-specific help.", "Read common mistakes before posting.", "Export manual for onboarding."];
    base.relatedReports = ["ERP User Manual", "Keyboard Guide", "Knowledge Base"];
  }
  return buildScreenHelpProfile(view, base, meta);
}
