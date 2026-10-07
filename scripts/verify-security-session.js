import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  authenticate,
  enforcePermission,
  hashPassword,
  initializeDatabase,
  setPermissionActorResolver
} from "../src/main/database/init.js";
import { activeSessionUserId, completePasswordChange, endSession, requireActiveSession, startSession } from "../src/main/services/sessionService.js";
import { createUser, resetUserPassword, updateUser } from "../src/main/services/userAdminService.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectBlocked(name, fn, pattern) {
  try {
    fn();
  } catch (error) {
    assert(pattern.test(error.message), `${name} failed with unexpected message: ${error.message}`);
    return { name, status: "pass", detail: error.message };
  }
  throw new Error(`${name} was not blocked`);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-security-"));
let db = initializeDatabase(root);
const results = [];

try {
  const admin = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
  db.prepare("UPDATE users SET password_hash = ?, force_password_change = 0 WHERE id = ?").run(hashPassword("Admin@Verify1"), admin.id);
  setPermissionActorResolver(activeSessionUserId);

  endSession();
  results.push(expectBlocked("No session blocks IPC work", () => requireActiveSession(), /not logged in/));
  results.push(expectBlocked("No session cannot borrow admin permission", () => enforcePermission(db, "post", { user_id: admin.id, module: "vouchers" }), /Permission denied/));

  const adminLogin = authenticate(db, "admin", "Admin@Verify1");
  startSession(adminLogin);
  assert(requireActiveSession().id === admin.id, "Admin session was not started");
  enforcePermission(db, "post", { module: "vouchers" });
  enforcePermission(db, "manage_users", { module: "user_management" });
  results.push({ name: "Admin session can post and manage users", status: "pass", detail: `user ${admin.id}` });

  const viewer = createUser(db, { username: "verify.viewer", display_name: "Verify Viewer", role: "viewer", password: "Viewer@Temp1" }, admin.id);
  assert(viewer.role === "viewer" && viewer.force_password_change, "Created user should be a viewer with a forced password change");
  results.push(expectBlocked("Duplicate username rejected", () => createUser(db, { username: "verify.viewer", display_name: "Dup", role: "viewer", password: "Viewer@Temp1" }, admin.id), /already exists/));
  results.push(expectBlocked("Weak temporary password rejected", () => createUser(db, { username: "verify.weak", display_name: "Weak", role: "viewer", password: "weak" }, admin.id), /Temporary Password/));
  results.push(expectBlocked("Admin cannot assign Super Admin", () => createUser(db, { username: "verify.super", display_name: "Super", role: "super_admin", password: "Super@Temp1" }, admin.id), /Super Admin/));
  results.push(expectBlocked("Admin cannot deactivate self", () => updateUser(db, admin.id, { status: "inactive" }, admin.id), /cannot deactivate yourself/));

  const viewerLogin = authenticate(db, "verify.viewer", "Viewer@Temp1");
  startSession(viewerLogin);
  results.push(expectBlocked("Forced password change blocks data access", () => requireActiveSession(), /Password change pending/));
  completePasswordChange(viewer.id);
  requireActiveSession();
  results.push(expectBlocked("Viewer cannot post even when claiming admin id", () => enforcePermission(db, "post", { user_id: admin.id, module: "vouchers" }), /your role \(viewer\)/));
  results.push(expectBlocked("Viewer cannot manage users", () => enforcePermission(db, "manage_users", { user_id: admin.id, module: "user_management" }), /Permission denied/));

  startSession(adminLogin);
  const second = createUser(db, { username: "verify.admin2", display_name: "Second Admin", role: "admin", password: "Admin2@Temp1" }, admin.id);
  updateUser(db, second.id, { role: "accountant" }, admin.id);
  assert(db.prepare("SELECT role FROM users WHERE id = ?").get(second.id).role === "accountant", "Admin should be able to change another user's role");
  results.push({ name: "Admin can change another user's role", status: "pass", detail: "verify.admin2 -> accountant" });
  results.push(expectBlocked("Admin cannot remove own admin role", () => updateUser(db, admin.id, { role: "viewer" }, admin.id), /remove your own administrator role/));

  db.prepare("UPDATE users SET locked_until = '2999-01-01T00:00:00.000Z', failed_login_count = 5 WHERE id = ?").run(viewer.id);
  resetUserPassword(db, viewer.id, "Viewer@Reset2", admin.id);
  const resetRow = db.prepare("SELECT force_password_change, locked_until, failed_login_count FROM users WHERE id = ?").get(viewer.id);
  assert(resetRow.force_password_change === 1 && !resetRow.locked_until && resetRow.failed_login_count === 0, "Password reset should unlock and force a change");
  assert(authenticate(db, "verify.viewer", "Viewer@Reset2")?.forcePasswordChange === true, "Reset password should log in with forced change");
  results.push({ name: "Password reset unlocks and forces change", status: "pass", detail: "verify.viewer" });

  updateUser(db, viewer.id, { status: "inactive" }, admin.id);
  assert(authenticate(db, "verify.viewer", "Viewer@Reset2") === null, "Inactive user must not log in");
  results.push({ name: "Inactive user cannot log in", status: "pass", detail: "verify.viewer" });

  const auditCount = db.prepare("SELECT COUNT(*) count FROM audit_log WHERE module = 'user_management'").get().count;
  assert(auditCount >= 5, "User management actions were not audited");
  results.push({ name: "User management audit trail", status: "pass", detail: `${auditCount} audit rows` });

  endSession();
  results.push(expectBlocked("Logout ends access", () => requireActiveSession(), /not logged in/));

  console.log(JSON.stringify({ root, passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ root, passed: results.length, failed: 1, results, error: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  setPermissionActorResolver(null);
  db?.close();
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(process.exitCode || 0);
}
