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

test("the money integrity check runs for an admin and a viewer, and only when signed in", async () => {
  assert.match((await call(newWindow(), "money:integrity", { company_id: 1 })).err || "", /not signed in/);
  for (const win of [await adminWindow(), await roleWindow("viewer5", "viewer")]) {
    const result = await call(win, "money:integrity", { company_id: 1 });
    assert.equal(result.err, undefined, result.err);
    assert.equal(typeof result.ok.ok, "boolean");
  }
});

// ---- SEC-1 session-bound authorization ----

test("SEC-1: high-impact channels refuse every role below admin, and record who was refused", async () => {
  const highImpact = [
    ["certificate:generate", {}], ["go-live:execute", { company_id: 1 }], ["go-live:verify", { goLiveId: 1 }],
    ["go-live:complete", { goLiveId: 1 }], ["go-live:rollback", { goLiveId: 1 }], ["reset:execute", { company_id: 1 }],
    ["reset:execute-enhanced", { company_id: 1 }], ["reset:rollback", { backup: "x.db" }],
    ["environment:set-profile", { profile: "Production" }], ["environment:switch-type", { environment: "Production" }]
  ];
  for (const role of ["viewer", "data_entry_operator", "accountant", "manager"]) {
    const win = await roleWindow(`sec1-${role}`, role);
    for (const [channel, payload] of highImpact) {
      const result = await call(win, channel, { ...payload, user_id: 1, user_role: "super_admin" });
      assert.match(result.err || "ran", /Permission denied/, `${role} ${channel}`);
    }
  }
  const db = side();
  try {
    const denied = db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action = 'permission_denied' AND user_id = (SELECT id FROM users WHERE username = 'sec1-manager')").get().c;
    assert.ok(denied >= highImpact.length, `each refusal names the manager (${denied})`);
  } finally { db.close(); }
});

test("SEC-1: an allowed high-impact action is recorded with the signed-in admin", async () => {
  const admin = await adminWindow();
  const before = (() => { const db = side(); try { return db.prepare("SELECT COALESCE(MAX(id), 0) id FROM audit_log").get().id; } finally { db.close(); } })();
  await call(admin, "environment:set-profile", { profile: "Development", user_id: 999 });
  const db = side();
  try {
    const row = db.prepare("SELECT a.user_id, u.username, a.new_value FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.id > ? AND a.action = 'permission_granted' ORDER BY a.id LIMIT 1").get(before);
    assert.equal(row?.username, "admin", "the grant names the signed-in admin, not the id the screen sent");
    assert.match(row.new_value, /system_reset/);
  } finally { db.close(); }
  // Channels behind the session guard record their grants too, for writes only: a read
  // (opening the mapping panel, listing users) is checked but writes no grant row.
  const mark = (() => { const side2 = side(); try { return side2.prepare("SELECT COALESCE(MAX(id), 0) id FROM audit_log").get().id; } finally { side2.close(); } })();
  await call(admin, "account-mapping:registry", { company_id: 1 });
  await call(admin, "account-mapping:coverage", { company_id: 1 });
  await call(admin, "auth:list-users");
  const db1 = side();
  try {
    assert.equal(db1.prepare("SELECT COUNT(*) c FROM audit_log WHERE id > ? AND action = 'permission_granted'").get(mark).c, 0, "reads write no grant rows");
  } finally { db1.close(); }
  await call(admin, "account-mapping:assign", { company_id: 1 });
  const db2 = side();
  try {
    const grant = db2.prepare("SELECT a.new_value, u.username FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.id > ? AND a.action = 'permission_granted' ORDER BY a.id LIMIT 1").get(mark);
    assert.equal(grant?.username, "admin");
    assert.match(grant.new_value, /account_mapping/);
  } finally { db2.close(); }
});

test("SEC-1: imports, bank preview and feedback export need their permission; the audit trail is a report", async () => {
  const viewer = await roleWindow("sec1-viewer2", "viewer");
  assert.match((await call(viewer, "bank:preview-import", { company_id: 1, rows: [] })).err || "", /Permission denied: import/);
  assert.match((await call(viewer, "imports:parse-file", "x.csv")).err || "", /Permission denied: import/);
  const deo = await roleWindow("sec1-deo", "data_entry_operator");
  const data = await call(deo, "accounting:data", { company_id: 1 });
  assert.ok(data.ok, data.err);
  assert.deepEqual(data.ok.auditLog, [], "a data-entry user does not receive the audit trail");
  const accountant = await roleWindow("sec1-acct", "accountant");
  const full = await call(accountant, "accounting:data", { company_id: 1 });
  assert.ok(full.ok.auditLog.length > 0, "an accountant does");
  const admin = await roleWindow("sec1-admin", "admin");
  assert.ok((await call(admin, "accounting:data", { company_id: 1 })).ok.auditLog.length > 0, "an admin does");
  const parsed = await call(deo, "imports:parse-buffer", "a.csv", new Uint8Array(Buffer.from("supplier_name\nX\n")));
  assert.deepEqual(parsed.ok, [{ supplier_name: "X" }], "byte arrays pass through the actor stamp unchanged");
});

test("605a873 round: a support bundle names the signed-in user and stays small whatever the screen sends", async () => {
  const admin = await adminWindow();
  const big = "x".repeat(300000);
  const context = { user_id: 999, user_name: "forged", company_id: 1, crashes: [{ message: "kept" }] };
  for (let i = 0; i < 10; i += 1) context[`${big}${i}`] = big;
  const result = await call(admin, "health:support-bundle", context);
  assert.ok(result.ok?.filePath, result.err);
  const bundle = JSON.parse(fs.readFileSync(result.ok.filePath, "utf8"));
  assert.ok(result.ok.size < 2 * 1024 * 1024, `bundle is ${result.ok.size} bytes`);
  const users = side();
  try { assert.equal(bundle.context.user_id, users.prepare("SELECT id FROM users WHERE username = 'admin'").get().id); } finally { users.close(); }
  assert.equal(bundle.context.user_name, "admin");
  assert.match(bundle.context.screenContextJson, /\(cut\)/);
  const small = await call(admin, "health:support-bundle", { source: "safe_mode", crashes: [{ message: "kept" }] });
  const kept = JSON.parse(fs.readFileSync(small.ok.filePath, "utf8"));
  assert.equal(JSON.parse(kept.context.screenContextJson).crashes[0].message, "kept", "Safe Mode's crash list is still in the bundle");
});

test("66b024f round: an update installer must be a real file directly in the update folder", async () => {
  const admin = await adminWindow();
  const status = await call(admin, "updates:status");
  const folder = status.ok?.updateFolder;
  assert.ok(folder, status.err);
  fs.mkdirSync(path.join(folder, "sub"), { recursive: true });
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "gii-outside-"));
  const target = path.join(outside, "GII-GeM-ERP-Setup-99.0.0-x64.exe");
  fs.writeFileSync(target, "x");
  const nested = path.join(folder, "sub", "GII-GeM-ERP-Setup-99.0.1-x64.exe");
  fs.writeFileSync(nested, "x");
  const link = path.join(folder, "GII-GeM-ERP-Setup-99.0.2-x64.exe");
  try { fs.symlinkSync(target, link); } catch { /* links may be unavailable; the sub-folder case still runs */ }
  try {
    assert.match((await call(admin, "updates:install", nested)).err || "", /not directly inside the update folder/);
    assert.match((await call(admin, "updates:install", path.join(folder, "GII-GeM-ERP-Setup-99.0.3-x64.exe:s-x64.exe"))).err || "", /cannot contain ":"/);
    if (fs.existsSync(link)) assert.match((await call(admin, "updates:install", link)).err || "", /not directly inside the update folder/);
  } finally {
    fs.rmSync(path.join(folder, "sub"), { recursive: true, force: true });
    fs.rmSync(link, { force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("8d5dd67 round: the updater launches a hashed copy of the installer, not the file in the update folder", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.1.0-x64.exe");
  fs.writeFileSync(installer, "installer bytes");
  const shell = electron.shell || electron.default.shell;
  const original = shell.openPath;
  let opened = "";
  let openedBytes = "";
  // A failure string keeps the app open after the launch, so the test can look around.
  shell.openPath = async (target) => { opened = target; openedBytes = fs.readFileSync(target, "utf8"); return "test stops here"; };
  try {
    const result = await call(admin, "updates:install", installer);
    assert.match(result.err || "", /test stops here/);
    assert.notEqual(path.dirname(opened), fs.realpathSync(folder), "the copy runs, not the file in the update folder");
    assert.match(opened, /update-staging/);
    assert.equal(openedBytes, "installer bytes");
    assert.equal(fs.existsSync(opened), false, "a copy that did not launch is not kept");
    const db = side();
    try {
      const row = db.prepare("SELECT new_value FROM audit_log WHERE action = 'update_installer_failed' ORDER BY id DESC LIMIT 1").get();
      assert.equal(JSON.parse(row.new_value).sha256, crypto.createHash("sha256").update("installer bytes").digest("hex"));
    } finally { db.close(); }
  } finally {
    shell.openPath = original;
    fs.rmSync(installer, { force: true });
  }
});

test("8d5dd67 round: the update folder only offers real installer files", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const fake = path.join(folder, "GII-GeM-ERP-Setup-98.0.0-x64.exe");
  fs.mkdirSync(fake, { recursive: true });
  try {
    const status = await call(admin, "updates:status");
    assert.ok(status.ok, status.err);
    assert.notEqual(path.basename(status.ok.installerPath || ""), "GII-GeM-ERP-Setup-98.0.0-x64.exe", "a folder with an installer's name is not offered");
  } finally {
    fs.rmSync(fake, { recursive: true, force: true });
  }
});

test("7955315 round: a hard-linked installer is refused and no copy is left behind", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "gii-hardlink-"));
  const target = path.join(outside, "planted.exe");
  fs.writeFileSync(target, "planted");
  const linked = path.join(folder, "GII-GeM-ERP-Setup-97.0.0-x64.exe");
  try {
    fs.linkSync(target, linked);
    assert.match((await call(admin, "updates:install", linked)).err || "", /linked to another file/);
    const staging = path.join(root, "update-staging");
    const left = fs.existsSync(staging) ? fs.readdirSync(staging, { recursive: true }).filter((name) => name.endsWith("GII-GeM-ERP-Setup-97.0.0-x64.exe")) : [];
    assert.deepEqual(left, [], "no copy is left behind");
  } finally {
    fs.rmSync(linked, { force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("efefcbb round: a second install is refused until the first one has launched or failed", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.2.0-x64.exe");
  fs.writeFileSync(installer, "first installer");
  const shell = electron.shell || electron.default.shell;
  const original = shell.openPath;
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let launches = 0;
  // The first install waits at the launch, after its copy and backup are done.
  shell.openPath = async () => { launches += 1; if (launches === 1) await held; return "test stops here"; };
  try {
    const first = call(admin, "updates:install", installer);
    for (let i = 0; i < 200 && launches === 0; i += 1) await new Promise((r) => setTimeout(r, 10));
    assert.equal(launches, 1, "the first install reached the launch");
    const second = await call(admin, "updates:install", installer);
    assert.match(second.err || "", /already being prepared/);
    release();
    assert.match((await first).err || "", /test stops here/);
    assert.equal(launches, 1, "only one installer was opened");
    const db = side();
    try {
      assert.ok(db.prepare("SELECT id FROM audit_log WHERE action = 'update_installer_refused' AND new_value LIKE '%already being prepared%'").get(), "the refusal is in the audit log");
    } finally { db.close(); }
    // After a failed launch the next install may run again.
    shell.openPath = async () => "test stops here";
    assert.match((await call(admin, "updates:install", installer)).err || "", /test stops here/);
  } finally {
    release();
    shell.openPath = original;
    fs.rmSync(installer, { force: true });
  }
});

test("efefcbb round: a link planted as the staging folder is not followed", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.3.0-x64.exe");
  fs.writeFileSync(installer, "staged bytes");
  const staging = path.join(root, "update-staging");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "gii-staging-"));
  fs.rmSync(staging, { recursive: true, force: true });
  fs.symlinkSync(outside, staging, "dir");
  const shell = electron.shell || electron.default.shell;
  const original = shell.openPath;
  let opened = "";
  let openedReal = "";
  shell.openPath = async (target) => { opened = target; openedReal = fs.realpathSync(target); return "test stops here"; };
  try {
    assert.match((await call(admin, "updates:install", installer)).err || "", /test stops here/);
    assert.ok(opened, "an installer copy was opened");
    assert.ok(!openedReal.startsWith(fs.realpathSync(outside)), "the copy is not written through the planted link");
    assert.equal(fs.readdirSync(outside).length, 0);
    assert.ok(fs.lstatSync(staging).isDirectory(), "the staging folder is a real folder again");
  } finally {
    shell.openPath = original;
    fs.rmSync(installer, { force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("efefcbb round: a refused installer leaves an audit row", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const portable = path.join(folder, "Other-Tool-1.0.0.exe");
  fs.writeFileSync(portable, "not ours");
  try {
    const result = await call(admin, "updates:install", portable);
    assert.match(result.err || "", /GII-GeM-ERP-Setup-<version>-x64\.exe/);
    const db = side();
    try {
      const row = db.prepare("SELECT new_value FROM audit_log WHERE action = 'update_installer_refused' ORDER BY id DESC LIMIT 1").get();
      assert.equal(JSON.parse(row.new_value).installer, "Other-Tool-1.0.0.exe");
    } finally { db.close(); }
  } finally {
    fs.rmSync(portable, { force: true });
  }
});

// Swaps fs.promises.open for one install, so the steps around the open can be tested.
async function withPatchedOpen(patch, run) {
  const original = fs.promises.open;
  fs.promises.open = (file, flags, mode) => patch(original, String(file), flags, mode);
  try { return await run(); } finally { fs.promises.open = original; }
}

test("32263ab round: a link swapped in while the file is opened is refused (the Windows path)", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.4.0-x64.exe");
  fs.writeFileSync(installer, "real installer");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "gii-swap-"));
  const target = path.join(outside, "planted.exe");
  fs.writeFileSync(target, "planted");
  const shell = electron.shell || electron.default.shell;
  const originalOpenPath = shell.openPath;
  let opened = false;
  shell.openPath = async () => { opened = true; return "test stops here"; };
  try {
    // Windows has no O_NOFOLLOW: the swap lands and the open follows the link.
    const result = await withPatchedOpen(async (open, file) => {
      if (file.endsWith("GII-GeM-ERP-Setup-99.4.0-x64.exe")) {
        fs.rmSync(file);
        fs.symlinkSync(target, file);
        return open(file, fs.constants.O_RDONLY);
      }
      return open(file);
    }, () => call(admin, "updates:install", installer));
    assert.match(result.err || "", /changed or is linked|not directly inside/);
    assert.equal(opened, false, "nothing was launched");
  } finally {
    shell.openPath = originalOpenPath;
    fs.rmSync(installer, { force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("32263ab round: a copy that fails part-way is removed and the size check holds", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.5.0-x64.exe");
  fs.writeFileSync(installer, "sized installer bytes");
  try {
    const result = await withPatchedOpen(async (open, file, flags) => {
      const handle = await open(file, flags);
      if (!file.endsWith("GII-GeM-ERP-Setup-99.5.0-x64.exe")) return handle;
      const stat = handle.stat.bind(handle);
      // The file reports one byte less than is then read, as a file still growing would.
      handle.stat = async (options) => { const st = await stat(options); return Object.create(st, { size: { value: typeof st.size === "bigint" ? st.size - 1n : st.size - 1 } }); };
      return handle;
    }, () => call(admin, "updates:install", installer));
    assert.match(result.err || "", /changed size/);
    const staging = path.join(root, "update-staging");
    assert.deepEqual(fs.existsSync(staging) ? fs.readdirSync(staging) : [], [], "the partial copy and its folder are removed");
  } finally {
    fs.rmSync(installer, { force: true });
  }
});

test("32263ab round: a raw file error is mapped, not shown with its path, and long names are cut in the audit log", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.6.0-x64.exe");
  fs.writeFileSync(installer, "x");
  try {
    const result = await withPatchedOpen(async (open, file, flags) => {
      if (file.endsWith("GII-GeM-ERP-Setup-99.6.0-x64.exe")) throw Object.assign(new Error("EACCES: open '/secret/update-installers/x.exe'"), { code: "EACCES", syscall: "open", path: file });
      return open(file, flags);
    }, () => call(admin, "updates:install", installer));
    assert.match(result.err || "", /could not be prepared \(EACCES\)/);
    assert.doesNotMatch(result.err || "", /secret/);
    assert.equal(lastRefusal().detail.file, "GII-GeM-ERP-Setup-99.6.0-x64.exe", "the audit row holds the file name, not its path");
    const long = `${"a".repeat(1000)}.exe`;
    await call(admin, "updates:install", path.join(folder, long));
    const db = side();
    try {
      const row = db.prepare("SELECT new_value FROM audit_log WHERE action = 'update_installer_refused' ORDER BY id DESC LIMIT 1").get();
      assert.ok(JSON.parse(row.new_value).installer.length <= 255);
    } finally { db.close(); }
  } finally {
    fs.rmSync(installer, { force: true });
  }
});

async function installWithStubbedLaunch(admin, installer, onLaunch = async () => "test stops here") {
  const shell = electron.shell || electron.default.shell;
  const original = shell.openPath;
  let launches = 0;
  shell.openPath = async (target) => { launches += 1; return onLaunch(target); };
  try { return { result: await call(admin, "updates:install", installer), launches: () => launches }; } finally { shell.openPath = original; }
}
const lastRefusal = () => { const db = side(); try { const row = db.prepare("SELECT new_value FROM audit_log WHERE action = 'update_installer_refused' ORDER BY id DESC LIMIT 1").get(); return row ? JSON.parse(row.new_value) : null; } finally { db.close(); } };

test("ef324d5 round: a staged copy that changes before the launch is not opened", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.7.0-x64.exe");
  fs.writeFileSync(installer, "hashed bytes");
  try {
    const { result, launches } = await withPatchedOpen(async (open, file, flags) => {
      if (file.includes("update-staging")) fs.writeFileSync(file, "other bytes");
      return open(file, flags);
    }, () => installWithStubbedLaunch(admin, installer));
    assert.match(result.err || "", /changed before it could start/);
    assert.equal(launches(), 0);
  } finally { fs.rmSync(installer, { force: true }); }
});

test("ef324d5 round: a link swapped in for the staging folder is moved away, never deleted through", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.7.6-x64.exe");
  fs.writeFileSync(installer, "bytes");
  const staging = path.join(root, "update-staging");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "gii-keep-"));
  fs.mkdirSync(path.join(outside, "install-precious"));
  fs.writeFileSync(path.join(outside, "install-precious", "keep.txt"), "keep me");
  fs.rmSync(staging, { recursive: true, force: true });
  fs.symlinkSync(outside, staging, "dir");
  try {
    const { result } = await installWithStubbedLaunch(admin, installer);
    assert.match(result.err || "", /test stops here/);
    assert.equal(fs.readFileSync(path.join(outside, "install-precious", "keep.txt"), "utf8"), "keep me", "the link's target is untouched");
    assert.ok(fs.lstatSync(staging).isDirectory());
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
    fs.rmSync(installer, { force: true });
  }
});

test("ef324d5 round: an unexpected error is mapped by the handler, with its code", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.7.1-x64.exe");
  fs.writeFileSync(installer, "bytes");
  try {
    const { result } = await withPatchedOpen(async (open, file, flags) => {
      if (file.includes("update-staging")) throw Object.assign(new Error("EIO: i/o error, read '/secret/x'"), { code: "EIO", syscall: "read" });
      return open(file, flags);
    }, () => installWithStubbedLaunch(admin, installer));
    assert.match(result.err || "", /The update was not started \(EIO\)/);
    assert.doesNotMatch(result.err || "", /secret/);
    assert.deepEqual(lastRefusal().detail, { code: "EIO", syscall: "read" });
  } finally { fs.rmSync(installer, { force: true }); }
});

test("ef324d5 round: a failed backup stops the update with its own message", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.7.2-x64.exe");
  fs.writeFileSync(installer, "bytes");
  const backups = path.join(root, "backups");
  const aside = `${backups}-aside`;
  const had = fs.existsSync(backups);
  if (had) fs.renameSync(backups, aside);
  fs.writeFileSync(backups, "a file where the backups folder should be");
  try {
    const { result, launches } = await installWithStubbedLaunch(admin, installer);
    assert.match(result.err || "", /backup before the update could not be taken/);
    assert.equal(launches(), 0);
  } finally {
    fs.rmSync(backups, { force: true });
    if (had) fs.renameSync(aside, backups);
    fs.rmSync(installer, { force: true });
  }
});

test("ef324d5 round: copies left by earlier attempts are cleared, and a full disk names the data folder", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.7.3-x64.exe");
  fs.writeFileSync(installer, "bytes");
  const old = path.join(root, "update-staging", "install-old");
  fs.mkdirSync(old, { recursive: true });
  fs.writeFileSync(path.join(old, "GII-GeM-ERP-Setup-1.0.0-x64.exe"), "old copy");
  try {
    const { result } = await withPatchedOpen(async (open, file, flags) => {
      if (file.endsWith("GII-GeM-ERP-Setup-99.7.3-x64.exe")) throw Object.assign(new Error("ENOSPC: no space left"), { code: "ENOSPC", syscall: "write" });
      return open(file, flags);
    }, () => installWithStubbedLaunch(admin, installer));
    assert.equal(fs.existsSync(old), false, "the old copy is gone");
    assert.deepEqual(fs.readdirSync(root).filter((name) => name.startsWith("update-staging.old-")), [], "nothing moved aside is left behind");
    assert.match(result.err || "", /disk that holds the ERP's data is full/);
    assert.equal(lastRefusal().detail.side, "data-folder");
  } finally { fs.rmSync(installer, { force: true }); }
});

test("ef324d5 round: a link swapped in as the staging folder at the last moment is refused", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.7.4-x64.exe");
  fs.writeFileSync(installer, "bytes");
  const staging = path.join(root, "update-staging");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "gii-mkdtemp-"));
  const original = fs.promises.mkdtemp;
  fs.promises.mkdtemp = async (prefix, options) => {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.symlinkSync(outside, staging, "dir");
    return original(prefix, options);
  };
  try {
    const { result, launches } = await installWithStubbedLaunch(admin, installer);
    assert.match(result.err || "", /update-staging folder changed/);
    assert.equal(launches(), 0);
    assert.deepEqual(fs.readdirSync(outside), [], "nothing is left in the link's target");
  } finally {
    fs.promises.mkdtemp = original;
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
    fs.rmSync(installer, { force: true });
  }
});

test("ef324d5 round: an installer over 1 GB, or with too little free space, is refused before any copy", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.7.5-x64.exe");
  fs.writeFileSync(installer, "small bytes");
  const fakeSize = (bytes) => (open, file, flags) => open(file, flags).then((handle) => {
    if (!file.endsWith("GII-GeM-ERP-Setup-99.7.5-x64.exe")) return handle;
    const stat = handle.stat.bind(handle);
    handle.stat = async (options) => { const st = await stat(options); return Object.create(st, { size: { value: typeof st.size === "bigint" ? BigInt(bytes) : bytes } }); };
    return handle;
  });
  const statfs = fs.promises.statfs;
  try {
    const big = await withPatchedOpen(fakeSize(1024 * 1024 * 1024 + 1), () => installWithStubbedLaunch(admin, installer));
    assert.match(big.result.err || "", /larger than any GII GeM ERP installer/);
    fs.promises.statfs = async (target) => Object.assign(await statfs(target), { bavail: 0 });
    const full = await installWithStubbedLaunch(admin, installer);
    assert.match(full.result.err || "", /not enough free disk space/);
    assert.equal(big.launches() + full.launches(), 0);
  } finally {
    fs.promises.statfs = statfs;
    fs.rmSync(installer, { force: true });
  }
});

test("64124dc round: a staging folder that cannot be moved (a file held open on Windows) is used where it is", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.8.0-x64.exe");
  fs.writeFileSync(installer, "bytes");
  fs.mkdirSync(path.join(root, "update-staging"), { recursive: true });
  const moved = path.join(root, "update-staging.old-0123456789abcdef");
  fs.mkdirSync(moved, { recursive: true });
  const original = fs.promises.rename;
  fs.promises.rename = async (from, to) => {
    if (String(from).endsWith("update-staging")) throw Object.assign(new Error("EBUSY: resource busy"), { code: "EBUSY" });
    return original(from, to);
  };
  try {
    const { result } = await installWithStubbedLaunch(admin, installer);
    assert.match(result.err || "", /test stops here/, "the install still runs");
    assert.equal(fs.existsSync(moved), false, "a folder moved aside earlier is swept");
  } finally {
    fs.promises.rename = original;
    fs.rmSync(installer, { force: true });
  }
});

test("64124dc round: a staging folder made by someone else meanwhile is refused", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.8.1-x64.exe");
  fs.writeFileSync(installer, "bytes");
  const original = fs.promises.mkdir;
  fs.promises.mkdir = async (target, options) => {
    if (String(target).endsWith("update-staging") && !options?.recursive) await original(target, { recursive: true });
    return original(target, options);
  };
  try {
    const { result, launches } = await installWithStubbedLaunch(admin, installer);
    assert.match(result.err || "", /update-staging folder changed/);
    assert.equal(launches(), 0);
  } finally {
    fs.promises.mkdir = original;
    fs.rmSync(installer, { force: true });
  }
});

test("64124dc round: a pipe put in place of the staged copy is not read or launched", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.8.2-x64.exe");
  fs.writeFileSync(installer, "bytes");
  const { execFileSync } = await import("node:child_process");
  try {
    const { result, launches } = await withPatchedOpen(async (open, file, flags) => {
      if (file.includes("update-staging")) { fs.rmSync(file); execFileSync("mkfifo", [file]); }
      return open(file, flags);
    }, () => installWithStubbedLaunch(admin, installer));
    assert.match(result.err || "", /changed before it could start/);
    assert.equal(launches(), 0);
  } finally {
    fs.rmSync(installer, { force: true });
    // The pipe is not something the updater removes (only its own copies), so tidy it here.
    fs.rmSync(path.join(root, "update-staging"), { recursive: true, force: true });
    for (const name of fs.readdirSync(root)) if (name.startsWith("update-staging.old-")) fs.rmSync(path.join(root, name), { recursive: true, force: true });
  }
});

test("64124dc round: a failed launch writes one audit row, and an unreachable update folder keeps its own message", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.8.3-x64.exe");
  fs.writeFileSync(installer, "bytes");
  const count = (action) => { const db = side(); try { return db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action = ? AND new_value LIKE '%99.8.3%'").get(action).c; } finally { db.close(); } };
  try {
    const { result } = await installWithStubbedLaunch(admin, installer);
    assert.match(result.err || "", /test stops here/);
    assert.equal(count("update_installer_failed"), 1);
    assert.equal(count("update_installer_refused"), 0);
  } finally { fs.rmSync(installer, { force: true }); }
  const blocker = path.join(root, "not-a-folder");
  fs.writeFileSync(blocker, "x");
  const saved = process.env.GII_GEM_ERP_UPDATE_DIR;
  process.env.GII_GEM_ERP_UPDATE_DIR = path.join(blocker, "updates");
  try {
    const result = await call(admin, "updates:install", path.join(blocker, "updates", "GII-GeM-ERP-Setup-99.8.4-x64.exe"));
    assert.match(result.err || "", /update folder .* could not be created or opened/);
  } finally {
    if (saved === undefined) delete process.env.GII_GEM_ERP_UPDATE_DIR; else process.env.GII_GEM_ERP_UPDATE_DIR = saved;
    fs.rmSync(blocker, { force: true });
  }
});

test("64124dc round: clearing the staging folder removes only installer copies and never walks a link", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.8.5-x64.exe");
  fs.writeFileSync(installer, "bytes");
  const victim = fs.mkdtempSync(path.join(os.tmpdir(), "gii-victim-"));
  fs.writeFileSync(path.join(victim, "GII-GeM-ERP-Setup-1.0.0-x64.exe"), "victim exe");
  fs.writeFileSync(path.join(victim, "books.db"), "victim data");
  const staging = path.join(root, "update-staging");
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(path.join(staging, "install-real"), { recursive: true });
  fs.writeFileSync(path.join(staging, "install-real", "GII-GeM-ERP-Setup-1.0.0-x64.exe"), "old copy");
  fs.symlinkSync(victim, path.join(staging, "install-linked"), "dir");
  fs.symlinkSync(victim, path.join(staging, "install-real", "nested"), "dir");
  fs.writeFileSync(path.join(staging, "install-real", "notes.txt"), "not an installer copy");
  fs.symlinkSync(path.join(victim, "books.db"), path.join(staging, "other-link"));
  const userFile = path.join(root, "update-staging.old-mine.txt");
  fs.writeFileSync(userFile, "a user's file with a similar name");
  try {
    const { result } = await installWithStubbedLaunch(admin, installer);
    assert.match(result.err || "", /test stops here/);
    assert.deepEqual(fs.readdirSync(victim).sort(), ["GII-GeM-ERP-Setup-1.0.0-x64.exe", "books.db"], "nothing behind a link was deleted");
    const moved = fs.readdirSync(root).filter((name) => /^update-staging\.old-[0-9a-f]{16}$/.test(name));
    assert.equal(moved.length, 1, "the moved-aside folder is kept because it holds something not ours");
    assert.ok(fs.lstatSync(path.join(root, moved[0], "other-link")).isSymbolicLink(), "a top-level link not named install-* is left alone");
    const kept = path.join(root, moved[0], "install-real");
    assert.deepEqual(fs.readdirSync(kept).sort(), ["nested", "notes.txt"], "only the installer copy was removed; a link below the top is left alone");
    assert.ok(fs.existsSync(userFile), "a file that only looks like a moved-aside folder is not swept");
  } finally {
    fs.rmSync(userFile, { force: true });
    for (const name of fs.readdirSync(root)) if (name.startsWith("update-staging.old-")) fs.rmSync(path.join(root, name), { recursive: true, force: true });
    fs.rmSync(installer, { force: true });
    fs.rmSync(victim, { recursive: true, force: true });
  }
});

test("4f3a9b6 round: an installer name that links to another file in the folder is refused", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const target = path.join(folder, "payload.bin");
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.8.6-x64.exe");
  fs.writeFileSync(target, "bytes");
  fs.symlinkSync(target, installer);
  try {
    const { result, launches } = await installWithStubbedLaunch(admin, installer);
    assert.match(result.err || "", /not directly inside the update folder/);
    assert.equal(launches(), 0);
  } finally {
    fs.rmSync(installer, { force: true });
    fs.rmSync(target, { force: true });
  }
});

test("4f3a9b6 round: a staging folder others can write to is not used in place", async () => {
  if (typeof process.getuid !== "function") return;
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.8.7-x64.exe");
  fs.writeFileSync(installer, "bytes");
  const staging = path.join(root, "update-staging");
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging);
  fs.chmodSync(staging, 0o777);
  const original = fs.promises.rename;
  fs.promises.rename = async (from, to) => {
    if (String(from).endsWith("update-staging")) throw Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });
    return original(from, to);
  };
  try {
    const { result, launches } = await installWithStubbedLaunch(admin, installer);
    assert.doesNotMatch(result.err || "", /test stops here/, "the install did not go ahead in that folder");
    assert.equal(launches(), 0);
  } finally {
    fs.promises.rename = original;
    fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(installer, { force: true });
  }
});

// Keep this test last: after a real launch the ERP is closing, so the updater stays locked.
test("32263ab round: after a launch, no second installer can be started", async () => {
  const admin = await adminWindow();
  const folder = (await call(admin, "updates:status")).ok.updateFolder;
  const installer = path.join(folder, "GII-GeM-ERP-Setup-99.9.0-x64.exe");
  fs.writeFileSync(installer, "launched installer");
  const shell = electron.shell || electron.default.shell;
  const original = shell.openPath;
  let launches = 0;
  shell.openPath = async () => { launches += 1; return ""; };
  try {
    assert.equal((await call(admin, "updates:install", installer)).ok?.closing, true);
    assert.match((await call(admin, "updates:install", installer)).err || "", /already been opened/);
    assert.equal(launches, 1);
  } finally {
    shell.openPath = original;
    fs.rmSync(installer, { force: true });
  }
});
