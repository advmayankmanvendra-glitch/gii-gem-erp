import { KEY_LAYOUT_TALLY, readKeyLayout, replacedByTallyLayout, tallyKeyboardShortcuts } from "./keyLayout.js";

const keyboardShortcuts = [
  { keys: "F1", action: "Open Screen Help", module: "Help and Training", scope: "global", contextGroup: "Always" },
  { keys: "Shift + F1", action: "Learn This Screen", module: "Help and Training", scope: "global", contextGroup: "Always" },
  { keys: "Ctrl + /", action: "Show shortcuts for this screen", module: "Help and Training", scope: "global", contextGroup: "Always" },
  { keys: "Ctrl + K", action: "Open Global Search", module: "General Navigation", scope: "global", contextGroup: "Always" },
  { keys: "Alt + Left Arrow", action: "Go back to previous screen", module: "General Navigation", scope: "global", contextGroup: "Always" },
  { keys: "Esc", action: "Close a dialog or safely exit the screen", module: "General Navigation", scope: "global", contextGroup: "Always" },
  { keys: "Alt + Home", action: "Return to Dashboard", module: "General Navigation", scope: "global" },
  { keys: "F11", action: "Toggle full screen", module: "General Navigation", scope: "global" },
  { keys: "F12", action: "Open user preferences", module: "General Navigation", scope: "global" },
  { keys: "Ctrl + S", action: "Save current form", module: "General Navigation", scope: "global" },
  { keys: "Ctrl + P", action: "Open ERP print preview", module: "General Navigation", scope: "global" },
  { keys: "Ctrl + R", action: "Refresh current screen", module: "General Navigation", scope: "global" },
  { keys: "F5", action: "Refresh current screen", module: "General Navigation", scope: "global" },
  { keys: "Ctrl + 1", action: "Open Dashboard", module: "Dashboard", scope: "global" },
  { keys: "Ctrl + 2", action: "Open Masters", module: "Masters", scope: "global" },
  { keys: "Ctrl + 3", action: "Open Supply Orders", module: "Operations", scope: "global" },
  { keys: "Ctrl + 4", action: "Open Inventory", module: "Inventory", scope: "global" },
  { keys: "Ctrl + 5", action: "Open Accounting", module: "Accounting", scope: "global" },
  { keys: "Ctrl + 6", action: "Open Receivables", module: "Receivables", scope: "global" },
  { keys: "Ctrl + 7", action: "Open Payables", module: "Payables", scope: "global" },
  { keys: "Ctrl + 8", action: "Open GST", module: "GST", scope: "global" },
  { keys: "Ctrl + 9", action: "Open Reports", module: "Reports", scope: "global" },

  { keys: "F2", action: "New Order", module: "Supply Orders", scope: "supply_orders", contextGroup: "This Screen" },
  { keys: "F3", action: "Edit selected order", module: "Supply Orders", scope: "supply_orders", contextGroup: "This Screen" },
  { keys: "F4", action: "View selected order", module: "Supply Orders", scope: "supply_orders", contextGroup: "This Screen" },
  { keys: "F6", action: "Generate procurement from selected order", module: "Supply Orders", scope: "supply_orders", contextGroup: "This Screen" },
  { keys: "F7", action: "Reserve stock for selected order", module: "Supply Orders", scope: "supply_orders", contextGroup: "This Screen" },
  { keys: "F8", action: "Generate invoice from selected order", module: "Supply Orders", scope: "supply_orders", contextGroup: "This Screen" },

  { keys: "F2", action: "Open stock receipt", module: "Inventory", scope: "inventory", contextGroup: "This Screen" },
  { keys: "F3", action: "Open stock issue", module: "Inventory", scope: "inventory", contextGroup: "This Screen" },
  { keys: "F4", action: "Open stock transfer", module: "Inventory", scope: "inventory", contextGroup: "This Screen" },
  { keys: "F5", action: "Open stock adjustment", module: "Inventory", scope: "inventory", contextGroup: "This Screen" },

  { keys: "F2", action: "Receipt Voucher", module: "Accounting", scope: "accounting", contextGroup: "This Screen" },
  { keys: "F3", action: "Payment Voucher", module: "Accounting", scope: "accounting", contextGroup: "This Screen" },
  { keys: "F4", action: "Sales Voucher", module: "Accounting", scope: "accounting", contextGroup: "This Screen" },
  { keys: "F5", action: "Purchase Voucher", module: "Accounting", scope: "accounting", contextGroup: "This Screen" },
  { keys: "F6", action: "Contra Voucher", module: "Accounting", scope: "accounting", contextGroup: "This Screen" },
  { keys: "F7", action: "Journal Voucher", module: "Accounting", scope: "accounting", contextGroup: "This Screen" },
  { keys: "F8", action: "Credit Note", module: "Accounting", scope: "accounting", contextGroup: "This Screen" },
  { keys: "F9", action: "Debit Note", module: "Accounting", scope: "accounting", contextGroup: "This Screen" },

  { keys: "Alt + R", action: "Open Receipt Voucher", module: "Receivables", scope: "receivables", contextGroup: "This Screen" },
  { keys: "Ctrl + F", action: "Search receivables", module: "Receivables", scope: "receivables", contextGroup: "This Screen" },
  { keys: "Alt + P", action: "Open Payment Voucher", module: "Payables", scope: "payables", contextGroup: "This Screen" },
  { keys: "Ctrl + F", action: "Search payables", module: "Payables", scope: "payables", contextGroup: "This Screen" },
  { keys: "Ctrl + S", action: "Save invoice", module: "Billing", scope: "billing", contextGroup: "This Screen" },
  { keys: "Ctrl + P", action: "Print invoice preview", module: "Billing", scope: "billing", contextGroup: "This Screen" },
  { keys: "F8", action: "Generate invoice from selected order", module: "Billing", scope: "billing", contextGroup: "This Screen" },
  { keys: "Ctrl + P", action: "Print report preview", module: "Reports", scope: "reports", contextGroup: "This Screen" },
  { keys: "Ctrl + E", action: "Export report", module: "Reports", scope: "reports", contextGroup: "This Screen" },
  { keys: "Ctrl + F", action: "Search report", module: "Reports", scope: "reports", contextGroup: "This Screen" },
  { keys: "Ctrl + R", action: "Refresh report", module: "Reports", scope: "reports", contextGroup: "This Screen" }
];

const moduleKeys = [...new Set(keyboardShortcuts.map((shortcut) => shortcut.module))];

function shortcutsForModule(module) {
  if (!module) return keyboardShortcuts;
  return keyboardShortcuts.filter((shortcut) => shortcut.module === module);
}

function shortcutsForScope(scope) {
  if (!scope || scope === "global") return keyboardShortcuts;
  return keyboardShortcuts.filter((shortcut) => shortcut.scope === "global" || shortcut.scope === scope);
}

function shortcutScopeForView(view) {
  if (view === "supply_orders") return "supply_orders";
  if (["inventory_dashboard", "stock_inwards", "stock_outwards", "stock_adjustments", "stock_returns", "warehouse_transfers", "stock_reservations"].includes(view)) return "inventory";
  if (["voucher_dashboard", "manual_voucher", "business_voucher"].includes(view)) return "accounting";
  if (["receivables", "department_ledger", "bill_wise_receivables", "receivable_ageing"].includes(view)) return "receivables";
  if (["payables", "supplier_ledger", "bill_wise_payables", "payable_ageing"].includes(view)) return "payables";
  if (["invoices", "billing_voucher", "gst_invoice"].includes(view)) return "billing";
  if (["reports", "trial_balance", "profit_loss", "balance_sheet", "cash_flow", "gst", "gst_reports", "outstanding_reports", "profitability_reports", "employee_reports"].includes(view)) return "reports";
  return "general";
}

// The shortcuts in force for the chosen key layout: with the Tally layout on, its keys
// replace the standard F2, F4-F9 and Alt + C.
function activeKeyboardShortcuts(layout = readKeyLayout()) {
  if (layout !== KEY_LAYOUT_TALLY) return keyboardShortcuts;
  return [...keyboardShortcuts.filter((shortcut) => !replacedByTallyLayout(shortcut)), ...tallyKeyboardShortcuts];
}

function shortcutGroupsForView(view, layout = readKeyLayout()) {
  const scope = shortcutScopeForView(view);
  const relevant = activeKeyboardShortcuts(layout).filter((shortcut) => shortcut.contextGroup && (shortcut.scope === "global" || shortcut.scope === scope));
  return ["This Screen", "Always"]
    .map((title) => ({ title, items: relevant.filter((shortcut) => shortcut.contextGroup === title).map((shortcut) => [shortcut.keys, shortcut.action]) }))
    .filter((group) => group.items.length);
}

const keyboardGuideSections = [
  ...moduleKeys.map((module) => [
    module,
    shortcutsForModule(module).map((shortcut) => [shortcut.keys, shortcut.action])
  ]),
  ["Tally Key Layout (optional, F12 to switch on)", tallyKeyboardShortcuts.map((shortcut) => [shortcut.keys, shortcut.action])]
];

export { activeKeyboardShortcuts, keyboardShortcuts, keyboardGuideSections, moduleKeys, shortcutGroupsForView, shortcutScopeForView, shortcutsForModule, shortcutsForScope };
