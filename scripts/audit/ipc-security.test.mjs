// IPC security tests: imports the real src/main/main.js with a stubbed "electron"
// module and calls its registered handlers the way a renderer window would.
// Run: node --import ./scripts/audit/lib/electron-register.mjs --test scripts/audit/ipc-security.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-ipc-"));
process.env.GII_GEM_ERP_DATA_ROOT = root;
const electron = await import("electron");
await import(pathToFileURL(path.join(REPO, "src/main/main.js")).href);
electron.app.__fireReady();
await new Promise((resolve) => setTimeout(resolve, 200));
const { handlers } = electron;
const init = await import(pathToFileURL(path.join(REPO, "src/main/database/init.js")).href);

process.on("exit", () => fs.rmSync(root, { recursive: true, force: true }));

let nextWindow = 100;
const newWindow = () => ({ sender: { id: nextWindow++ } });
async function call(win, channel, ...args) {
  const fn = handlers.get(channel);
  assert.ok(fn, `channel ${channel} is registered`);
  try { return { ok: await fn(win, ...args) }; } catch (error) { return { err: String(error.message || error) }; }
}
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
};
// A side connection to the same database file, for setup and checks.
const side = () => init.openDatabase(root);

async function adminWindow() {
  const win = newWindow();
  let login = await call(win, "auth:login", { username: "admin", password: "Admin@2026x" });
  if (!login.ok) login = await call(win, "auth:login", { username: "admin", password: "admin123" });
  assert.ok(login.ok, "default admin can sign in");
  if (login.ok.forcePasswordChange) {
    const changed = await call(win, "auth:change-password", { current_password: "admin123", new_password: "Admin@2026x" });
    assert.ok(changed.ok, `password change works: ${changed.err}`);
  }
  return win;
}

test("every channel except the public ones refuses a window that never signed in", async () => {
  const win = newWindow();
  const publicChannels = new Set(["auth:login", "auth:logout", "auth:recovery-reset", "meta:masters", "meta:transactions", "master-data:definitions", "updates:status", "environment:get-profiles", "app:force-close"]);
  const leaked = [];
  for (const channel of handlers.keys()) {
    if (publicChannels.has(channel)) continue;
    const result = await call(win, channel, {});
    if (!result.err || !/not signed in/i.test(result.err)) leaked.push(`${channel}: ${result.err || "ran"}`);
  }
  assert.deepEqual(leaked, []);
});

test("reset, go-live and rollback cannot run before login", async () => {
  const win = newWindow();
  for (const channel of ["reset:execute", "reset:execute-enhanced", "reset:rollback", "go-live:execute", "go-live:rollback", "environment:switch-type"]) {
    const result = await call(win, channel, { company_id: 1, confirm_text: "RESET" });
    assert.match(result.err || "", /not signed in/i, channel);
  }
  const db = side();
  try { assert.ok(db.prepare("SELECT COUNT(*) c FROM vouchers").get().c > 0, "data untouched"); } finally { db.close(); }
});

test("forced password change blocks everything except the password change", async () => {
  const db = side();
  const hash = hashPassword("Temp@1234x");
  db.prepare("INSERT INTO users (username, display_name, password_hash, role, status, force_password_change) VALUES ('newacct', 'New', ?, 'accountant', 'active', 1)").run(hash);
  db.close();
  const win = newWindow();
  const login = await call(win, "auth:login", { username: "newacct", password: "Temp@1234x" });
  assert.equal(login.ok?.forcePasswordChange, true);
  assert.match((await call(win, "accounting:data", { company_id: 1 })).err || "", /change your password/i);
  assert.ok((await call(win, "auth:change-password", { current_password: "Temp@1234x", new_password: "Better@1234x" })).ok);
  assert.ok((await call(win, "accounting:data", { company_id: 1 })).ok, "opens after the change");
});

test("a viewer cannot post, delete, reset or restore, even when it claims to be the admin", async () => {
  const db = side();
  db.prepare("INSERT INTO users (username, display_name, password_hash, role, status, force_password_change) VALUES ('viewer1', 'Viewer', ?, 'viewer', 'active', 0)").run(hashPassword("View@1234x"));
  db.close();
  const win = newWindow();
  assert.ok((await call(win, "auth:login", { username: "viewer1", password: "View@1234x" })).ok);
  const attempts = [
    ["records:create", "companies", { company_name: "Spoof", status: "active", user_id: 1 }],
    ["vouchers:reverse", 1, "spoof"],
    ["records:delete", "suppliers", 1],
    ["backup:restore", "x.db"],
    ["reset:execute", { company_id: 1, confirm_text: "RESET", userId: 1 }],
    ["financial-years:create", { company_id: 1, user_id: 1 }],
    ["money:rounding-adjustment", { voucherId: 1, userId: 1 }]
  ];
  for (const [channel, ...args] of attempts) {
    assert.match((await call(win, channel, ...args)).err || "", /Permission denied/i, channel);
  }
});

test("password change counts toward the lockout and cannot unlock a locked account", async () => {
  const db = side();
  db.prepare("INSERT INTO users (username, display_name, password_hash, role, status, force_password_change) VALUES ('lockme', 'Lock', ?, 'accountant', 'active', 0)").run(hashPassword("Lock@1234x"));
  db.close();
  const win = newWindow();
  assert.ok((await call(win, "auth:login", { username: "lockme", password: "Lock@1234x" })).ok);
  for (let i = 0; i < 5; i += 1) await call(win, "auth:change-password", { current_password: "wrong", new_password: "Other@1234x" });
  const locked = await call(win, "auth:change-password", { current_password: "Lock@1234x", new_password: "Other@1234x" });
  assert.match(locked.err || "", /locked/i);
  assert.equal((await call(newWindow(), "auth:login", { username: "lockme", password: "Lock@1234x" })).ok, null, "login refused while locked");
});

test("recovery and admin password reset are wired up", async () => {
  const admin = await adminWindow();
  const db = side();
  const target = db.prepare("INSERT INTO users (username, display_name, password_hash, role, status, force_password_change) VALUES ('forgetful', 'F', ?, 'accountant', 'active', 0)").run(hashPassword("Forget@1234x")).lastInsertRowid;
  db.close();
  const reset = await call(admin, "auth:admin-reset-password", { user_id: Number(target), new_password: "Reset@1234x" });
  assert.ok(reset.ok, reset.err);
  const recovery = await call(newWindow(), "auth:recovery-reset", { username: "forgetful", recovery_secret: "nope", new_password: "Reset@5678x" });
  assert.doesNotMatch(recovery.err || "", /is not defined/);
});

test("the audit trail names the signed-in user, not what the screen sends", async () => {
  const admin = await adminWindow();
  const created = await call(admin, "records:create", "suppliers", { supplier_name: "Audit Probe", status: "active", user_id: 4242, created_by: 4242 });
  assert.ok(created.ok, created.err);
  const forged = await call(admin, "audit:context", { action: "voucher_approved", user_id: 4242 });
  assert.match(forged.err || "", /only be written by the ERP/);
  const db = side();
  try {
    const row = db.prepare("SELECT user_id FROM audit_log WHERE table_name = 'suppliers' AND record_id = ? ORDER BY id DESC LIMIT 1").get(created.ok.id);
    const adminId = db.prepare("SELECT id FROM users WHERE username = 'admin'").get().id;
    assert.equal(row?.user_id, adminId);
  } finally { db.close(); }
});

test("reset clears only the selected company, needs RESET typed, and is audited and reversible", async () => {
  const admin = await adminWindow();
  assert.match((await call(admin, "reset:execute", { company_id: 1, confirm_text: "yes" })).err || "", /type RESET/i);
  assert.match((await call(admin, "reset:execute", { confirm_text: "RESET" })).err || "", /no company is selected/i);
  let db = side();
  const before = db.prepare("SELECT COUNT(*) c FROM vouchers WHERE company_id = 1").get().c;
  const otherBefore = db.prepare("SELECT COUNT(*) c FROM vouchers WHERE company_id <> 1").get().c;
  db.close();
  assert.ok(before > 0);
  const result = await call(admin, "reset:execute", { company_id: 1, confirm_text: "RESET" });
  assert.ok(result.ok, result.err);
  db = side();
  try {
    assert.equal(db.prepare("SELECT COUNT(*) c FROM vouchers WHERE company_id = 1").get().c, 0);
    assert.equal(db.prepare("SELECT COUNT(*) c FROM vouchers WHERE company_id <> 1").get().c, otherBefore, "other companies untouched");
    assert.ok(db.prepare("SELECT id FROM audit_log WHERE action = 'operational_reset'").get(), "reset is audited");
  } finally { db.close(); }
  const rollback = await call(admin, "reset:rollback", { backup: result.ok.backup.fileName });
  assert.ok(rollback.ok?.success, rollback.ok?.reason || rollback.err);
  db = side();
  try {
    assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
    assert.equal(db.prepare("SELECT COUNT(*) c FROM vouchers WHERE company_id = 1").get().c, before, "rollback restored the vouchers");
  } finally { db.close(); }
  // The main process connection must still work after the rollback.
  assert.ok((await call(admin, "accounting:data", { company_id: 1 })).ok);
});

test("import parser only reads files picked in the file dialog", async () => {
  const admin = await adminWindow();
  assert.match((await call(admin, "imports:parse-file", "/etc/passwd")).err || "", /Browse button/);
});

async function roleWindow(username, role) {
  const db = side();
  if (!db.prepare("SELECT id FROM users WHERE username = ?").get(username)) {
    db.prepare("INSERT INTO users (username, display_name, password_hash, role, status, force_password_change) VALUES (?, ?, ?, ?, 'active', 0)").run(username, username, hashPassword("Role@1234x"), role);
  }
  db.close();
  const win = newWindow();
  assert.ok((await call(win, "auth:login", { username, password: "Role@1234x" })).ok, `${username} signs in`);
  return win;
}

test("only an admin can change supplier or company bank details", async () => {
  const deo = await roleWindow("deo1", "data_entry_operator");
  let db = side();
  const supplier = db.prepare("SELECT * FROM suppliers ORDER BY id LIMIT 1").get();
  const company = db.prepare("SELECT * FROM companies ORDER BY id LIMIT 1").get();
  db.close();
  const denied = await call(deo, "records:update", "suppliers", supplier.id, { ...supplier, supplier_account_number: "999988887777", supplier_bank_ifsc_code: "EVIL0000001" });
  assert.match(denied.err || "", /Permission denied: settings/);
  assert.match((await call(deo, "records:update", "companies", company.id, { ...company, account_number: "111122223333" })).err || "", /Permission denied/);
  const bank = await call(deo, "records:create", "banks", { company_id: 1, bank_account_name: "X", bank_name: "Y", account_number: "100100", status: "active" });
  assert.ok(bank.ok, `a new bank master can be created: ${bank.err}`);
  assert.match((await call(deo, "records:update", "banks", bank.ok.id, { ...bank.ok, account_number: "999999" })).err || "", /Permission denied: settings/);
  assert.ok((await call(deo, "records:update", "banks", bank.ok.id, { ...bank.ok, remarks: "edited" })).ok, "other bank fields stay editable");
  const renamed = await call(deo, "records:update", "suppliers", supplier.id, { ...supplier, remarks: "edited by data entry" });
  assert.ok(renamed.ok, `other supplier fields stay editable: ${renamed.err}`);
  db = side();
  try {
    assert.equal(db.prepare("SELECT supplier_account_number FROM suppliers WHERE id = ?").get(supplier.id).supplier_account_number, supplier.supplier_account_number);
  } finally { db.close(); }
  const admin = await adminWindow();
  const allowed = await call(admin, "records:update", "suppliers", supplier.id, { ...supplier, supplier_account_number: "123400001234" });
  assert.ok(allowed.ok, allowed.err);
  db = side();
  try {
    const row = db.prepare("SELECT old_value, new_value FROM audit_log WHERE action = 'bank_details_changed' AND record_id = ? ORDER BY id DESC LIMIT 1").get(supplier.id);
    assert.match(row?.new_value || "", /123400001234/);
  } finally { db.close(); }
});

test("a session ends when its user is disabled or no longer in the database", async () => {
  const win = await roleWindow("gone1", "accountant");
  assert.ok((await call(win, "accounting:data", { company_id: 1 })).ok);
  const db = side();
  db.prepare("UPDATE users SET status = 'inactive' WHERE username = 'gone1'").run();
  db.close();
  assert.match((await call(win, "accounting:data", { company_id: 1 })).err || "", /no longer valid/);
  assert.match((await call(win, "accounting:data", { company_id: 1 })).err || "", /not signed in/, "the session was cleared");
});

test("screens can write only known audit events and cannot fake a record's history", async () => {
  const viewer = await roleWindow("viewer2", "viewer");
  assert.match((await call(viewer, "audit:context", { action: "edited voucher", table_name: "vouchers", record_id: 1, old_value: "x" })).err || "", /only be written by the ERP/);
  const written = await call(viewer, "audit:context", { action: "import company mapping approval", table_name: "vouchers", record_id: 1, old_value: "{\"amount\":1}", new_value: "ok" });
  assert.equal(written.err, undefined);
  const db = side();
  try {
    const row = db.prepare("SELECT table_name, old_value FROM audit_log WHERE action = 'ui:import company mapping approval' ORDER BY id DESC LIMIT 1").get();
    assert.equal(row.table_name, "ui_context");
    assert.ok(!row.old_value, "old value from the screen is dropped");
  } finally { db.close(); }
});

test("feedback is stored under the signed-in user, not the name the screen sends", async () => {
  const viewer = await roleWindow("viewer3", "viewer");
  const saved = await call(viewer, "feedback:submit", { user_id: 1, user_name: "System Administrator", message: "hello", category: "suggestion" });
  assert.ok(saved.ok, saved.err);
  const db = side();
  try {
    const row = db.prepare("SELECT f.user_name, u.username FROM feedback_log f JOIN users u ON u.id = f.user_id WHERE f.id = ?").get(saved.ok.id);
    assert.deepEqual(row, { user_name: "viewer3", username: "viewer3" });
  } finally { db.close(); }
});

test("installers and in-memory imports need the right role", async () => {
  const viewer = await roleWindow("viewer4", "viewer");
  assert.match((await call(viewer, "updates:install", "setup.exe")).err || "", /Permission denied: settings/);
  assert.match((await call(viewer, "imports:parse-buffer", "a.csv", Buffer.from("supplier_name\nX\n"))).err || "", /Permission denied: import/);
  const deo = await roleWindow("deo2", "data_entry_operator");
  const parsed = await call(deo, "imports:parse-buffer", "a.csv", Buffer.from("supplier_name\nX\n"));
  assert.ok(parsed.ok, parsed.err);
});

test("go-live readiness channels read the selected company from the screen", async () => {
  const admin = await adminWindow();
  const db = side();
  const empty = db.prepare("INSERT INTO companies (company_name) VALUES ('IPC Empty Co')").run().lastInsertRowid;
  db.close();
  const whole = await call(admin, "deployment:readiness", {});
  const scoped = await call(admin, "deployment:readiness", { company_id: Number(empty) });
  assert.ok(whole.ok && scoped.ok, whole.err || scoped.err);
  assert.notDeepEqual(scoped.ok, whole.ok, "the company in the payload changes the result");
  assert.ok((await call(admin, "go-live:preconditions", { company_id: Number(empty) })).ok);
});

test("reset rollback without a named backup restores nothing", async () => {
  const admin = await adminWindow();
  const result = await call(admin, "reset:rollback", {});
  assert.equal(result.ok?.success, false);
  assert.match(result.ok?.reason || "", /no backup was named/);
});

test("bank details cannot be changed under another field name, wiped, or set on a new record by a data-entry user", async () => {
  const deo = await roleWindow("deo3", "data_entry_operator");
  let db = side();
  const supplier = db.prepare("SELECT * FROM suppliers ORDER BY id LIMIT 1").get();
  const company = db.prepare("SELECT * FROM companies ORDER BY id LIMIT 1").get();
  const employee = db.prepare("SELECT * FROM employees ORDER BY id LIMIT 1").get();
  db.close();
  const { supplier_account_number: _a, supplier_bank_ifsc_code: _b, ...withoutBank } = supplier;
  const aliased = await call(deo, "records:update", "suppliers", supplier.id, { ...withoutBank, account_number: "999988887777", ifsc: "EVIL0000001" });
  assert.match(aliased.err || "", /Permission denied: settings/, "alias names are checked");
  // Give the company bank details so the checks below always run.
  let setup = side();
  setup.prepare("UPDATE companies SET bank_name = 'SBI', account_number = '30001234567', ifsc = 'SBIN0001234' WHERE id = ?").run(company.id);
  setup.close();
  const { account_number: _c, ifsc: _d, bank_name: _e, ...companyNoBank } = company;
  assert.ok((await call(deo, "records:update", "companies", company.id, { ...companyNoBank, remarks: "edited" })).ok, "leaving bank fields out is an ordinary edit");
  const wiped = await call(deo, "records:update", "companies", company.id, { ...companyNoBank, account_number: "", ifsc: "", bank_name: "" });
  assert.match(wiped.err || "", /only an admin can add or change them/, "blanking them is refused with the reason");
  setup = side();
  try {
    assert.deepEqual({ ...setup.prepare("SELECT bank_name, account_number, ifsc FROM companies WHERE id = ?").get(company.id) }, { bank_name: "SBI", account_number: "30001234567", ifsc: "SBIN0001234" });
  } finally { setup.close(); }
  assert.match((await call(deo, "records:create", "suppliers", { supplier_name: "New With Bank", status: "active", supplier_account_number: "123123123123" })).err || "", /Permission denied: settings/);
  assert.ok((await call(deo, "records:create", "suppliers", { supplier_name: "New Without Bank", status: "active" })).ok, "a supplier without bank details can still be created");
  if (employee) {
    assert.match((await call(deo, "records:update", "employees", employee.id, { ...employee, account_number: "555500005555" })).err || "", /Permission denied: settings/);
  }
  const imported = await call(deo, "imports:confirm", "suppliers", [{ supplier_name: "Imported With Bank", supplier_account_number: "777700007777", status: "active" }], { file_name: "x.csv" });
  assert.match(imported.err || "", /Permission denied: settings/, JSON.stringify(imported));
  const master = await call(deo, "master-data:confirm-update", { masterKey: "suppliers", company_id: 1, mode: "insert_update", rows: [{ supplier_code: "MD-BANK-1", supplier_name: "Master With Bank", account_number: "888800008888", is_active: "active" }] });
  assert.match(master.err || "", /Permission denied: settings/, JSON.stringify(master));
  db = side();
  try {
    assert.equal(db.prepare("SELECT supplier_account_number FROM suppliers WHERE id = ?").get(supplier.id).supplier_account_number, supplier.supplier_account_number);
    assert.equal(db.prepare("SELECT COUNT(*) c FROM suppliers WHERE supplier_account_number IN ('123123123123', '777700007777', '888800008888')").get().c, 0);
  } finally { db.close(); }
});

test("edit forms that leave bank fields out still save for non-admins and keep the bank details", async () => {
  const accountant = await roleWindow("acct-forms", "accountant");
  const deo = await roleWindow("deo-forms", "data_entry_operator");
  let db = side();
  db.prepare("UPDATE employees SET bank_name = 'SBI', account_number = '111', ifsc = 'SBIN0000001', branch = 'X' WHERE id = (SELECT MIN(id) FROM employees)").run();
  db.prepare("UPDATE suppliers SET upi_id = 'abc@upi' WHERE id = (SELECT MIN(id) FROM suppliers)").run();
  const employee = db.prepare("SELECT * FROM employees ORDER BY id LIMIT 1").get();
  const supplier = db.prepare("SELECT * FROM suppliers ORDER BY id LIMIT 1").get();
  db.close();
  // MasterScreen sends only the fields shown on the form (src/renderer/config/viewDefinitions.js).
  const employeeForm = { employee_name: employee.employee_name, mobile_number: employee.mobile_number, designation: "Senior", incentive_percentage: employee.incentive_percentage, status: employee.status };
  const employeeEdit = await call(accountant, "records:update", "employees", employee.id, employeeForm);
  assert.ok(employeeEdit.ok, employeeEdit.err);
  const { upi_id: _u, ...supplierForm } = supplier;
  const supplierEdit = await call(accountant, "records:update", "suppliers", supplier.id, { ...supplierForm, remarks: "edited on the form" });
  assert.ok(supplierEdit.ok, supplierEdit.err);
  const admin = await adminWindow();
  const imported = await call(admin, "master-data:confirm-update", { masterKey: "suppliers", company_id: 1, mode: "insert_update", rows: [{ supplier_code: "MD-FORM-1", supplier_name: "Form Supplier", bank_name: "HDFC", account_number: "5050505050", ifsc: "HDFC0000123", is_active: "active" }] });
  assert.ok(imported.ok, imported.err);
  db = side();
  const mdSupplier = db.prepare("SELECT * FROM suppliers WHERE supplier_code = 'MD-FORM-1'").get();
  db.close();
  const deoEdit = await call(deo, "records:update", "suppliers", mdSupplier.id, { ...mdSupplier, remarks: "phone changed" });
  assert.ok(deoEdit.ok, `a supplier imported with bank details stays editable: ${deoEdit.err}`);
  const deoImport = await call(deo, "imports:confirm", "suppliers", [{ supplier_name: "Form Supplier", supplier_code: "MD-FORM-1", remarks: "x", status: "active" }], { file_name: "u.csv", import_mode: "update_existing" });
  assert.ok(deoImport.ok, deoImport.err);
  db = side();
  try {
    assert.deepEqual({ ...db.prepare("SELECT designation, bank_name, account_number, ifsc, branch FROM employees WHERE id = ?").get(employee.id) }, { designation: "Senior", bank_name: "SBI", account_number: "111", ifsc: "SBIN0000001", branch: "X" });
    assert.equal(db.prepare("SELECT upi_id FROM suppliers WHERE id = ?").get(supplier.id).upi_id, "abc@upi");
    const md = db.prepare("SELECT supplier_account_number, supplier_bank_ifsc_code, bank_details FROM suppliers WHERE id = ?").get(mdSupplier.id);
    assert.equal(md.supplier_account_number, "5050505050");
    assert.equal(md.supplier_bank_ifsc_code, "HDFC0000123");
    assert.equal(md.bank_details ?? "", mdSupplier.bank_details ?? "", "the bank text is not rewritten by an unrelated edit");
  } finally { db.close(); }
});

test("an .xlsx with a cell past Excel's last column is refused quickly", async () => {
  const admin = await adminWindow();
  const zlib = await import("node:zlib");
  const sheet = Buffer.from('<worksheet><sheetData><row r="1"><c r="ZZZZZZ1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>');
  const name = Buffer.from("xl/worksheets/sheet1.xml");
  const data = zlib.deflateRawSync(sheet);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt16LE(name.length, 28);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length + name.length, 12); eocd.writeUInt32LE(local.length + name.length + data.length, 16);
  const started = Date.now();
  const result = await call(admin, "imports:parse-buffer", "wide.xlsx", Buffer.concat([local, name, data, central, name, eocd]));
  assert.match(result.err || "", /beyond Excel's last column/);
  assert.ok(Date.now() - started < 2000);
});
