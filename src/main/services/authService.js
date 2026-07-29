import crypto from "node:crypto";

const ROLE_HIERARCHY = ["super_admin", "admin", "accountant", "manager", "data_entry_operator", "viewer"];

const ROLE_PERMISSIONS = {
  super_admin: new Set(["*"]),
  admin: new Set(["create", "edit", "delete", "reverse", "approve", "post", "restore_backup", "backup", "financial_year_close", "financial_year_reopen", "opening_balance", "import", "export", "settings", "account_mapping"]),
  accountant: new Set(["create", "edit", "post", "reverse", "opening_balance", "import", "export", "view_reports", "backup", "account_mapping"]),
  manager: new Set(["create", "edit", "approve", "export", "view_reports", "backup"]),
  data_entry_operator: new Set(["create", "edit", "import", "export", "backup"]),
  viewer: new Set(["export", "view_reports"])
};

const SECURITY = {
  maxFailedLogins: 5,
  sessionTimeoutMinutes: 30,
  minPasswordLength: 8
};

export function createAuthService(deps) {
  const { auditLog } = deps;

  function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  function verifyPassword(password, stored) {
    if (!stored || !stored.includes(":")) return false;
    const [salt, expected] = stored.split(":");
    const actual = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), actual);
  }

  function passwordStrengthErrors(password = "") {
    const value = String(password || "");
    const errors = [];
    if (value.length < 8) errors.push("Password must be at least 8 characters.");
    if (!/[A-Z]/.test(value)) errors.push("Password must include an uppercase letter.");
    if (!/[a-z]/.test(value)) errors.push("Password must include a lowercase letter.");
    if (!/[0-9]/.test(value)) errors.push("Password must include a number.");
    return errors;
  }

  function markDefaultAdminPasswordForChange(db) {
    const admin = db.prepare("SELECT id, password_hash, force_password_change FROM users WHERE username = 'admin'").get();
    if (admin && verifyPassword("admin123", admin.password_hash) && !Number(admin.force_password_change || 0)) {
      db.prepare("UPDATE users SET force_password_change = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(admin.id);
    }
  }

  function normalizeRole(role = "") {
    const normalized = String(role || "").trim().toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
    if (normalized === "data_entry") return "data_entry_operator";
    if (normalized === "superadmin") return "super_admin";
    return ROLE_HIERARCHY.includes(normalized) ? normalized : "viewer";
  }

  function roleCan(role, permission) {
    const allowed = ROLE_PERMISSIONS[normalizeRole(role)] || ROLE_PERMISSIONS.viewer;
    return allowed.has("*") || allowed.has(permission);
  }

  function userForPermission(db, userId) {
    if (userId) return db.prepare("SELECT id, username, display_name, role, status FROM users WHERE id = ?").get(userId);
    return db.prepare("SELECT id, username, display_name, role, status FROM users WHERE status = 'active' ORDER BY CASE WHEN role IN ('super_admin','admin') THEN 0 ELSE 1 END, id LIMIT 1").get();
  }

  function enforcePermission(db, permission, context = {}) {
    const user = userForPermission(db, context.user_id || context.userId || context.created_by || context.uploaded_by || context.imported_by || null);
    if (!user || user.status !== "active" || !roleCan(user.role, permission)) {
      const role = user?.role || "anonymous";
      auditLog(db, {
        company_id: context.company_id || null,
        user_id: user?.id || null,
        user_role: role,
        action: "permission_denied",
        module: context.module || context.table_name || context.table || permission,
        table_name: "security",
        record_id: context.record_id || null,
        new_value: JSON.stringify({ permission, role, reason: "backend permission enforcement" })
      });
      throw new Error(`Permission denied: ${permission}`);
    }
    return user;
  }

  function authenticate(db, username, password) {
    const user = db.prepare("SELECT * FROM users WHERE username = ? AND status = 'active'").get(username);
    const now = new Date().toISOString();
    if (user?.locked_until && user.locked_until > now) {
      auditLog(db, { user_id: user.id, user_role: user.role, action: "login_blocked_locked_user", module: "security", table_name: "users", record_id: user.id });
      return null;
    }
    if (!user || !verifyPassword(password, user.password_hash)) {
      if (user) {
        const failedCount = Number(user.failed_login_count || 0) + 1;
        const lockedUntil = failedCount >= SECURITY.maxFailedLogins ? new Date(Date.now() + SECURITY.sessionTimeoutMinutes * 60 * 1000).toISOString() : null;
        db.prepare("UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(failedCount, lockedUntil, user.id);
        auditLog(db, { user_id: user.id, user_role: user.role, action: "login_failed", module: "security", table_name: "users", record_id: user.id, new_value: JSON.stringify({ failedCount, lockedUntil }) });
      }
      return null;
    }
    const forcePasswordChange = user.username === "admin" && verifyPassword("admin123", user.password_hash)
      ? 1
      : Number(user.force_password_change || 0);
    if (forcePasswordChange !== Number(user.force_password_change || 0)) {
      db.prepare("UPDATE users SET force_password_change = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
    }
    db.prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
    auditLog(db, { user_id: user.id, user_role: user.role, action: "login_success", module: "security", table_name: "users", record_id: user.id });
    return {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      forcePasswordChange: Boolean(forcePasswordChange)
    };
  }

  function changeUserPassword(db, payload = {}) {
    const userId = Number(payload.user_id || payload.userId || 0);
    const username = String(payload.username || "").trim();
    const currentPassword = String(payload.current_password || payload.currentPassword || "");
    const newPassword = String(payload.new_password || payload.newPassword || "");
    const user = userId
      ? db.prepare("SELECT * FROM users WHERE id = ? AND status = 'active'").get(userId)
      : db.prepare("SELECT * FROM users WHERE username = ? AND status = 'active'").get(username);
    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      if (user) {
        auditLog(db, { user_id: user.id, user_role: user.role, action: "password_change_failed", module: "security", table_name: "users", record_id: user.id });
      }
      throw new Error("Current password is incorrect.");
    }
    const errors = passwordStrengthErrors(newPassword);
    if (errors.length) {
      throw new Error(errors.join(" "));
    }
    if (verifyPassword(newPassword, user.password_hash)) {
      throw new Error("New password must be different from the current password.");
    }
    db.prepare(`
      UPDATE users
      SET password_hash = ?,
          force_password_change = 0,
          failed_login_count = 0,
          locked_until = NULL,
          password_changed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(hashPassword(newPassword), user.id);
    auditLog(db, {
      user_id: user.id,
      user_role: user.role,
      action: "password_changed",
      module: "security",
      table_name: "users",
      record_id: user.id,
      new_value: JSON.stringify({ first_run_hardening: true })
    });
    const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    return {
      id: updated.id,
      username: updated.username,
      displayName: updated.display_name,
      role: updated.role,
      forcePasswordChange: Boolean(updated.force_password_change)
    };
  }

  return {
    hashPassword, verifyPassword, normalizeRole, enforcePermission,
    authenticate, changeUserPassword, markDefaultAdminPasswordForChange,
    userForPermission
  };
}
