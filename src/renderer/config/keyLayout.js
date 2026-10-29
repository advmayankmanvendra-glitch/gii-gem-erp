// Optional Tally-style key layout. The standard layout stays the default; a user can
// switch in User Preferences (F12). The choice is kept on this computer only. Mouse
// and menu use are the same in both layouts.

export const KEY_LAYOUT_STANDARD = "standard";
export const KEY_LAYOUT_TALLY = "tally";
export const KEY_LAYOUT_EVENT = "gii-gem-key-layout";
const STORAGE_KEY = "gii-gem-key-layout";

export function readKeyLayout() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === KEY_LAYOUT_TALLY ? KEY_LAYOUT_TALLY : KEY_LAYOUT_STANDARD;
  } catch {
    return KEY_LAYOUT_STANDARD;
  }
}

export function saveKeyLayout(layout) {
  const value = layout === KEY_LAYOUT_TALLY ? KEY_LAYOUT_TALLY : KEY_LAYOUT_STANDARD;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage can be unavailable; the choice then lasts for this session only.
  }
  window.dispatchEvent(new CustomEvent(KEY_LAYOUT_EVENT, { detail: value }));
  return value;
}

// Voucher keys as Tally uses them. Each opens the same voucher screen as the standard
// layout's key for that voucher.
const TALLY_VOUCHER_KEYS = [
  { keys: "F4", key: "F4", ctrl: false, kind: "contra", view: "voucher_dashboard", label: "Contra Voucher" },
  { keys: "F5", key: "F5", ctrl: false, kind: "supplier_payment", view: "voucher_dashboard", label: "Payment Voucher" },
  { keys: "F6", key: "F6", ctrl: false, kind: "receipt", view: "voucher_dashboard", label: "Receipt Voucher" },
  { keys: "F7", key: "F7", ctrl: false, kind: "journal", view: "manual_voucher", label: "Journal Voucher" },
  { keys: "F8", key: "F8", ctrl: false, kind: "sales", view: "voucher_dashboard", label: "Sales Voucher" },
  { keys: "F9", key: "F9", ctrl: false, kind: "purchase", view: "voucher_dashboard", label: "Purchase Voucher" },
  { keys: "Ctrl + F8", key: "F8", ctrl: true, kind: "credit_note", view: "voucher_dashboard", label: "Credit Note" },
  { keys: "Ctrl + F9", key: "F9", ctrl: true, kind: "debit_note", view: "voucher_dashboard", label: "Debit Note" }
];

// What a key press means in the Tally layout, or null when the standard handling applies.
// insidePicker: focus is on a party, ledger or item picker, which keeps its own F4 (open list).
export function tallyKeyAction(event, { insidePicker = false } = {}) {
  if (event.metaKey || event.shiftKey) return null;
  const ctrl = Boolean(event.ctrlKey);
  if (!event.altKey) {
    if (insidePicker && event.key === "F4" && !ctrl) return null;
    const voucher = TALLY_VOUCHER_KEYS.find((item) => item.key === event.key && item.ctrl === ctrl);
    if (voucher) return { type: "voucher", kind: voucher.kind, view: voucher.view, label: voucher.label };
    if (event.key === "F2" && !ctrl) return { type: "change_date" };
    return null;
  }
  if (!ctrl && event.key.toLowerCase() === "c") return { type: "create_master" };
  return null;
}

// Puts the cursor on the date of the form being entered, as Tally's F2 does.
export function focusEntryDate() {
  const scope = document.querySelector(".workspace form") || document.querySelector(".workspace");
  const field = scope?.querySelector("input[type='date']:not([disabled]):not([readonly])");
  if (!field) return false;
  field.focus();
  field.select?.();
  return true;
}

export const tallyKeyboardShortcuts = [
  ...TALLY_VOUCHER_KEYS.map((item) => ({ keys: item.keys, action: `Open ${item.label}`, module: "Tally Key Layout", scope: "global", contextGroup: "Always" })),
  { keys: "F2", action: "Change the date of the entry being made", module: "Tally Key Layout", scope: "global", contextGroup: "Always" },
  { keys: "Alt + C", action: "Create a master from the party, ledger or item field", module: "Tally Key Layout", scope: "global", contextGroup: "Always" },
  { keys: "Enter", action: "On the last voucher line, adds a new line once it has an account and amount", module: "Tally Key Layout", scope: "global", contextGroup: "Always" },
  { keys: "Ctrl + R", action: "Refresh current screen (F5 now opens Payment)", module: "Tally Key Layout", scope: "global", contextGroup: "Always" }
];

// Shortcuts the Tally layout takes over: hidden from the shortcut lists while it is on.
export function replacedByTallyLayout(shortcut) {
  const key = String(shortcut.keys || "");
  if (/^F[24-9]$/.test(key)) return true;
  return key === "Alt + C";
}

export const ADD_VOUCHER_LINE_EVENT = "gii-gem-add-voucher-line";

// Handles one key press in the Tally layout. Returns true when the key was used.
// openVoucher(kind, view) opens a voucher screen; notify(message, tone) shows a hint.
export function handleTallyKey(event, { openVoucher, notify }) {
  const active = document.activeElement;
  if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && active?.dataset?.enterAddsLine === "true") {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent(ADD_VOUCHER_LINE_EVENT));
    return true;
  }
  const insidePicker = Boolean(active?.closest?.(".entity-picker-trigger"));
  const action = tallyKeyAction(event, { insidePicker });
  if (!action) return false;
  event.preventDefault();
  if (action.type === "voucher") {
    openVoucher(action.kind, action.view);
  } else if (action.type === "change_date") {
    if (!focusEntryDate()) notify?.("This screen has no entry date to change.", "warning");
  } else if (action.type === "create_master") {
    const inField = Boolean(active?.closest?.(".entity-picker-trigger, .searchable-field"));
    if (inField) window.dispatchEvent(new CustomEvent("gii-gem-quick-create"));
    else notify?.("Alt + C creates a master from a party, ledger or item field. Move to that field first.", "warning");
  }
  return true;
}
