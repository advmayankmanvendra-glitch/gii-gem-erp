// The optional Tally key layout (src/renderer/config/keyLayout.js).
// Run from the repo root:  node --test scripts/audit/key-layout.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const layout = await import(pathToFileURL(path.join(REPO, "src/renderer/config/keyLayout.js")).href);
const shortcuts = await import(pathToFileURL(path.join(REPO, "src/renderer/config/keyboardShortcuts.js")).href);

const press = (key, extra = {}) => ({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...extra });

test("Tally voucher keys open the vouchers Tally users expect", () => {
  const kind = (event) => layout.tallyKeyAction(event)?.kind;
  assert.equal(kind(press("F4")), "contra");
  assert.equal(kind(press("F5")), "supplier_payment");
  assert.equal(kind(press("F6")), "receipt");
  assert.equal(kind(press("F7")), "journal");
  assert.equal(kind(press("F8")), "sales");
  assert.equal(kind(press("F9")), "purchase");
  assert.equal(kind(press("F8", { ctrlKey: true })), "credit_note");
  assert.equal(kind(press("F9", { ctrlKey: true })), "debit_note");
  assert.equal(layout.tallyKeyAction(press("F7")).view, "manual_voucher");
});

test("F2 changes the date, Alt + C creates a master, and other keys keep their standard use", () => {
  assert.equal(layout.tallyKeyAction(press("F2")).type, "change_date");
  assert.equal(layout.tallyKeyAction(press("c", { altKey: true })).type, "create_master");
  assert.equal(layout.tallyKeyAction(press("C", { altKey: true })).type, "create_master");
  for (const event of [press("F3"), press("F1"), press("F10"), press("F12"), press("s", { ctrlKey: true }), press("r", { altKey: true }), press("F5", { shiftKey: true })]) {
    assert.equal(layout.tallyKeyAction(event), null, JSON.stringify(event));
  }
  assert.equal(layout.tallyKeyAction(press("F4"), { insidePicker: true }), null, "a picker keeps F4 to open its list");
});

test("the standard layout stays the default", () => {
  assert.equal(layout.readKeyLayout(), layout.KEY_LAYOUT_STANDARD);
  assert.deepEqual(shortcuts.activeKeyboardShortcuts("standard"), shortcuts.keyboardShortcuts);
});

test("shortcut help shows the keys in force for the chosen layout", () => {
  const items = (view, which) => shortcuts.shortcutGroupsForView(view, which).flatMap((group) => group.items);
  const standard = items("voucher_dashboard", "standard");
  const tally = items("voucher_dashboard", "tally");
  assert.ok(standard.some(([keys, action]) => keys === "F4" && /Sales/.test(action)));
  assert.ok(tally.some(([keys, action]) => keys === "F4" && /Contra/.test(action)));
  assert.ok(!tally.some(([keys, action]) => keys === "F4" && /Sales/.test(action)), "the replaced standard F4 is hidden");
  assert.ok(tally.some(([keys]) => keys === "Ctrl + F8"));
  assert.ok(!items("voucher_dashboard", "standard").some(([keys]) => keys === "Ctrl + F8"));
  assert.ok(shortcuts.keyboardGuideSections.some(([title]) => /Tally Key Layout/.test(title)));
});
