/**
 * User administration - create users, change role/status and reset passwords.
 * Callers must already have passed the "manage_users" permission check.
 */
import { auditLog, hashPassword, normalizeRole, passwordStrengthErrors, ROLE_HIERARCHY } from "../database/init.js";

const ADMIN_ROLES = new Set(["super_admin", "admin"]);
const USER_STATUSES = new Set(["active", "inactive"]);
const USER_COLUMNS = "id, username, display_name, role, status, force_password_change, failed_login_count, locked_until, last_login_at, password_changed_at, created_at, updated_at";

function userError(field, message) {
  return new Error(`User Management > ${field}: ${message}`);
}

function getActor(db, actorId) {
  const actor = db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(actorId);
  if (!actor) throw userError("Session", "the logged-in user was not found. Log out and log in again.");
  return { ...actor, role: normalizeRole(actor.role) };
}

function assertAssignableRole(actor, role) {
  if (!ROLE_HIERARCHY.includes(role)) {
    throw userError("Role", `choose one of: ${ROLE_HIERARCHY.join(", ")}.`);
  }
  if (role === "super_admin" && actor.role !== "super_admin") {
    throw userError("Role", "only a Super Admin can create or assign the Super Admin role. Choose Admin or a lower role.");
  }
}

function activeAdminCount(db, excludeId) {
  return db.prepare(`
    SELECT COUNT(*) AS count FROM users
    WHERE status = 'active' AND role IN ('super_admin', 'admin') AND id <> ?
  `).get(Number(excludeId || 0)).count;
}

function publicUser(db, id) {
  const row = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(id);
  if (!row) return null;
  return { ...row, role: normalizeRole(row.role), force_password_change: Boolean(row.force_password_change) };
}

export function listUsers(db) {
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, username`).all()
    .map((row) => ({ ...row, role: normalizeRole(row.role), force_password_change: Boolean(row.force_password_change) }));
}

export function listAssignableRoles() {
  return [...ROLE_HIERARCHY];
}

export function createUser(db, payload = {}, actorId) {
  const actor = getActor(db, actorId);
  const username = String(payload.username || "").trim().toLowerCase();
  const displayName = String(payload.display_name || payload.displayName || "").trim();
  const role = normalizeRole(payload.role || "viewer");
  const password = String(payload.password || "");
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw userError("Username", "use 3 to 32 characters: letters, numbers, dot, dash or underscore.");
  }
  if (!displayName) throw userError("Display Name", "enter the person's name as it should appear in audit logs.");
  assertAssignableRole(actor, role);
  const passwordErrors = passwordStrengthErrors(password);
  if (passwordErrors.length) throw userError("Temporary Password", passwordErrors.join(" "));
  if (db.prepare("SELECT id FROM users WHERE username = ?").get(username)) {
    throw userError("Username", `"${username}" already exists. Choose a different username or edit the existing user.`);
  }
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, display_name, role, status, force_password_change)
    VALUES (?, ?, ?, ?, 'active', 1)
  `).run(username, hashPassword(password), displayName, role);
  auditLog(db, {
    user_id: actor.id,
    user_role: actor.role,
    action: "user_created",
    module: "user_management",
    table_name: "users",
    record_id: result.lastInsertRowid,
    new_value: JSON.stringify({ username, display_name: displayName, role })
  });
  return publicUser(db, result.lastInsertRowid);
}

export function updateUser(db, id, payload = {}, actorId) {
  const actor = getActor(db, actorId);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(id));
  if (!user) throw userError("User", "the selected user no longer exists. Refresh the list and try again.");
  const currentRole = normalizeRole(user.role);
  const role = payload.role === undefined ? currentRole : normalizeRole(payload.role);
  const status = payload.status === undefined ? user.status : String(payload.status).toLowerCase();
  const displayName = payload.display_name === undefined ? user.display_name : String(payload.display_name).trim();
  if (!displayName) throw userError("Display Name", "the name cannot be blank.");
  if (!USER_STATUSES.has(status)) throw userError("Status", "choose Active or Inactive.");
  if (role !== currentRole) assertAssignableRole(actor, role);
  if (currentRole === "super_admin" && actor.role !== "super_admin" && (role !== currentRole || status !== user.status)) {
    throw userError("Role", "only a Super Admin can change another Super Admin's role or status.");
  }
  if (Number(user.id) === Number(actor.id) && (status !== "active" || !ADMIN_ROLES.has(role))) {
    throw userError("Role / Status", "you cannot deactivate yourself or remove your own administrator role. Ask another administrator to do it.");
  }
  const remainsAdmin = status === "active" && ADMIN_ROLES.has(role);
  if (ADMIN_ROLES.has(currentRole) && user.status === "active" && !remainsAdmin && activeAdminCount(db, user.id) === 0) {
    throw userError("Role / Status", "this is the last active administrator. Create or activate another administrator first.");
  }
  db.prepare(`
    UPDATE users SET display_name = ?, role = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(displayName, role, status, user.id);
  auditLog(db, {
    user_id: actor.id,
    user_role: actor.role,
    action: "user_updated",
    module: "user_management",
    table_name: "users",
    record_id: user.id,
    old_value: JSON.stringify({ display_name: user.display_name, role: currentRole, status: user.status }),
    new_value: JSON.stringify({ display_name: displayName, role, status })
  });
  return publicUser(db, user.id);
}

export function resetUserPassword(db, id, newPassword, actorId) {
  const actor = getActor(db, actorId);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(id));
  if (!user) throw userError("User", "the selected user no longer exists. Refresh the list and try again.");
  if (normalizeRole(user.role) === "super_admin" && actor.role !== "super_admin") {
    throw userError("Reset Password", "only a Super Admin can reset a Super Admin's password.");
  }
  const errors = passwordStrengthErrors(newPassword);
  if (errors.length) throw userError("Temporary Password", errors.join(" "));
  db.prepare(`
    UPDATE users
    SET password_hash = ?, force_password_change = 1, failed_login_count = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(hashPassword(String(newPassword)), user.id);
  auditLog(db, {
    user_id: actor.id,
    user_role: actor.role,
    action: "user_password_reset",
    module: "user_management",
    table_name: "users",
    record_id: user.id,
    new_value: JSON.stringify({ force_password_change: true, unlocked: true })
  });
  return publicUser(db, user.id);
}
