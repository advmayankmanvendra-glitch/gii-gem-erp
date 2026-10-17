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
    ["financial-years:create", { company_id: 1, user_id: 1 }]
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
