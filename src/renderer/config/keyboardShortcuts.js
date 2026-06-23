const keyboardShortcuts = [
  { keys: "Enter", action: "Move to next editable field", module: "General Navigation", scope: "global" },
  { keys: "Shift + Enter", action: "Move to previous editable field", module: "General Navigation", scope: "global" },
  { keys: "Esc", action: "Close modal/dropdown or safely exit screen", module: "General Navigation", scope: "global" },
  { keys: "Alt + Home", action: "Return to Dashboard", module: "General Navigation", scope: "global" },
  { keys: "Ctrl + K", action: "Open Global Search", module: "General Navigation", scope: "global" },
  { keys: "Ctrl + Shift + K", action: "Open advanced search where available", module: "General Navigation", scope: "global" },
  { keys: "F1", action: "Open Keyboard Shortcut Guide", module: "General Navigation", scope: "global" },
  { keys: "F11", action: "Toggle full screen", module: "General Navigation", scope: "global" },
  { keys: "F12", action: "User Preferences", module: "General Navigation", scope: "global" },
  { keys: "Ctrl + R", action: "Refresh current screen", module: "General Navigation", scope: "global" },
  { keys: "F5", action: "Refresh current screen", module: "General Navigation", scope: "global" },
  { keys: "Ctrl + /", action: "Show context shortcuts for this screen", module: "General Navigation", scope: "global" },
  { keys: "Ctrl + 1", action: "Open Dashboard", module: "Dashboard", scope: "global" },
  { keys: "Ctrl + P", action: "Print current screen", module: "Global", scope: "global" },
  { keys: "Ctrl + 2", action: "Open Masters group", module: "Masters", scope: "global" },
  { keys: "Ctrl + N", action: "Create new record", module: "Masters", scope: "global" },
  { keys: "Ctrl + E", action: "Edit selected record", module: "Masters", scope: "global" },
  { keys: "Ctrl + F", action: "Focus search field", module: "Masters", scope: "global" },
  { keys: "F10", action: "Quick create from supported transaction field", module: "Masters", scope: "global" },
  { keys: "Shift + F10", action: "Open alternate quick-create action", module: "Masters", scope: "global" },
  { keys: "Ctrl + S", action: "Save current form", module: "Global", scope: "global" },
  { keys: "Ctrl + B", action: "Navigate to Settings", module: "General Navigation", scope: "global" },
  { keys: "Ctrl + Shift + B", action: "Create Backup", module: "Financial Control", scope: "global" },
  { keys: "Ctrl + Shift + R", action: "Open Restore Backup", module: "Financial Control", scope: "global" },
  { keys: "Ctrl + Shift + P", action: "Production Health Dashboard", module: "Financial Control", scope: "global" },
  { keys: "Ctrl + Shift + L", action: "Audit Log", module: "Financial Control", scope: "global" },
  { keys: "F2", action: "New Order / Stock Receipt", module: "Supply Orders", scope: "supply_orders" },
  { keys: "F3", action: "Edit Selected Order / Stock Issue", module: "Supply Orders", scope: "supply_orders" },
  { keys: "F4", action: "View Selected Order / Stock Transfer", module: "Supply Orders", scope: "supply_orders" },
  { keys: "F6", action: "Generate Procurement", module: "Supply Orders", scope: "supply_orders" },
  { keys: "F7", action: "Reserve Stock", module: "Supply Orders", scope: "supply_orders" },
  { keys: "F8", action: "Generate Invoice", module: "Supply Orders", scope: "supply_orders" },
  { keys: "F6", action: "Generate Procurement from selected order", module: "Procurement", scope: "procurement" },
  { keys: "F10", action: "Quick create supplier, item or warehouse", module: "Procurement", scope: "procurement" },
  { keys: "Ctrl + S", action: "Save procurement form", module: "Procurement", scope: "procurement" },
  { keys: "Ctrl + 4", action: "Open Inventory group", module: "Inventory", scope: "inventory" },
  { keys: "F2", action: "Stock Receipt", module: "Inventory", scope: "inventory" },
  { keys: "F3", action: "Stock Issue", module: "Inventory", scope: "inventory" },
  { keys: "F4", action: "Stock Transfer", module: "Inventory", scope: "inventory" },
  { keys: "F5", action: "Stock Adjustment", module: "Inventory", scope: "inventory" },
  { keys: "Alt + I", action: "Stock Issue", module: "Inventory", scope: "inventory" },
  { keys: "Alt + G", action: "Stock Receipt (GRN)", module: "Inventory", scope: "inventory" },
  { keys: "Alt + T", action: "Warehouse Transfer", module: "Inventory", scope: "inventory" },
  { keys: "Alt + A", action: "Stock Adjustment", module: "Inventory", scope: "inventory" },
  { keys: "F8", action: "Generate Invoice from selected order", module: "Billing", scope: "invoices" },
  { keys: "F10", action: "Quick create item, department, institution or bank", module: "Billing", scope: "invoices" },
  { keys: "Ctrl + S", action: "Save invoice", module: "Billing", scope: "invoices" },
  { keys: "Ctrl + P", action: "Print invoice or report preview", module: "Billing", scope: "invoices" },
  { keys: "Ctrl + 6", action: "Open Receivables", module: "Receivables", scope: "receivables" },
  { keys: "Alt + R", action: "Receipt Voucher", module: "Receivables", scope: "receivables" },
  { keys: "Ctrl + F", action: "Search outstanding", module: "Receivables", scope: "receivables" },
  { keys: "Ctrl + E", action: "Edit selected permitted record", module: "Receivables", scope: "receivables" },
  { keys: "Ctrl + 7", action: "Open Payables", module: "Payables", scope: "payables" },
  { keys: "Alt + P", action: "Payment Voucher", module: "Payables", scope: "payables" },
  { keys: "Ctrl + F", action: "Search payable", module: "Payables", scope: "payables" },
  { keys: "Ctrl + E", action: "Edit selected permitted record", module: "Payables", scope: "payables" },
  { keys: "Ctrl + 5", action: "Open Accounting", module: "Accounting", scope: "accounting" },
  { keys: "Alt + R", action: "Receipt Voucher", module: "Accounting", scope: "accounting" },
  { keys: "Alt + P", action: "Payment Voucher", module: "Accounting", scope: "accounting" },
  { keys: "Alt + S", action: "Sales Voucher", module: "Accounting", scope: "accounting" },
  { keys: "Alt + U", action: "Purchase Voucher", module: "Accounting", scope: "accounting" },
  { keys: "Alt + J", action: "Journal Voucher", module: "Accounting", scope: "accounting" },
  { keys: "Alt + C", action: "Contra Voucher", module: "Accounting", scope: "accounting" },
  { keys: "Alt + N", action: "Credit Note", module: "Accounting", scope: "accounting" },
  { keys: "Alt + D", action: "Debit Note", module: "Accounting", scope: "accounting" },
  { keys: "Ctrl + 8", action: "Open GST group", module: "GST", scope: "gst" },
  { keys: "Ctrl + F", action: "Search tax report", module: "GST", scope: "gst" },
  { keys: "Ctrl + P", action: "Print tax report", module: "GST", scope: "gst" },
  { keys: "Ctrl + R", action: "Refresh tax report", module: "GST", scope: "gst" },
  { keys: "Ctrl + 9", action: "Open Reports", module: "Reports", scope: "reports" },
  { keys: "Ctrl + P", action: "Print", module: "Reports", scope: "reports" },
  { keys: "Ctrl + E", action: "Export", module: "Reports", scope: "reports" },
  { keys: "Ctrl + F", action: "Search", module: "Reports", scope: "reports" },
  { keys: "Ctrl + R", action: "Refresh", module: "Reports", scope: "reports" },
  { keys: "F1", action: "Open shortcut guide", module: "Help and Training", scope: "global" },
  { keys: "Ctrl + K", action: "Search ERP", module: "Help and Training", scope: "global" },
  { keys: "Esc", action: "Close help dialog", module: "Help and Training", scope: "global" },
  { keys: "Ctrl + P", action: "Print or save manual through preview", module: "Help and Training", scope: "global" }
];

const moduleKeys = [...new Set(keyboardShortcuts.map((s) => s.module))];

function shortcutsForModule(module) {
  if (!module) return keyboardShortcuts;
  return keyboardShortcuts.filter((s) => s.module === module);
}

function shortcutsForScope(scope) {
  if (!scope || scope === "global") return keyboardShortcuts;
  return keyboardShortcuts.filter((s) => s.scope === "global" || s.scope === scope);
}

const keyboardGuideSections = moduleKeys.map((module) => [
  module,
  shortcutsForModule(module).map((s) => [s.keys, s.action])
]);

export { keyboardShortcuts, keyboardGuideSections, moduleKeys, shortcutsForModule, shortcutsForScope };
