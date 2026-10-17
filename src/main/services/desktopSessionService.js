function requiredSenderId(value) {
  const senderId = Number(value || 0);
  if (!Number.isInteger(senderId) || senderId <= 0) {
    throw new Error("A valid Electron window is required.");
  }
  return senderId;
}

function requiredUserId(value) {
  const userId = Number(value || 0);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("A valid signed-in user is required.");
  }
  return userId;
}

// A signed-in window is signed out after this many idle minutes.
const IDLE_TIMEOUT_MINUTES = 60;

export function createDesktopSessionService(deps = {}) {
  const { auditLog, enforcePermission } = deps;
  const sessions = new Map();
  const idleTimeoutMs = Number(deps.idleTimeoutMinutes || IDLE_TIMEOUT_MINUTES) * 60 * 1000;

  function bindSession(senderIdValue, user = {}) {
    const senderId = requiredSenderId(senderIdValue);
    const userId = requiredUserId(user.id || user.user_id);
    const session = {
      user_id: userId,
      username: String(user.username || ""),
      role: String(user.role || ""),
      force_password_change: Boolean(user.forcePasswordChange || user.force_password_change),
      authenticated_at: new Date().toISOString(),
      last_seen_at: Date.now()
    };
    sessions.set(senderId, session);
    return { ...session };
  }

  function clearSession(senderIdValue) {
    const senderId = Number(senderIdValue || 0);
    if (!Number.isInteger(senderId) || senderId <= 0) return false;
    return sessions.delete(senderId);
  }

  function getSession(senderIdValue) {
    const senderId = Number(senderIdValue || 0);
    const session = sessions.get(senderId);
    if (!session) return null;
    if (Date.now() - Number(session.last_seen_at || 0) > idleTimeoutMs) {
      sessions.delete(senderId);
      return null;
    }
    session.last_seen_at = Date.now();
    return { ...session };
  }

  function markPasswordChanged(senderIdValue) {
    const session = sessions.get(Number(senderIdValue || 0));
    if (session) session.force_password_change = false;
  }

  // Signs a user out of every window, for example after an admin resets their password.
  function clearUserSessions(userId) {
    for (const [senderId, session] of sessions.entries()) {
      if (Number(session.user_id) === Number(userId)) sessions.delete(senderId);
    }
  }

  function requirePermission(db, senderIdValue, permission, context = {}) {
    const senderId = requiredSenderId(senderIdValue);
    const session = getSession(senderId);
    if (!session) {
      if (typeof auditLog === "function") {
        auditLog(db, {
          company_id: context.company_id || null,
          action: "permission_denied",
          module: context.module || "desktop_session",
          table_name: "security",
          new_value: JSON.stringify({
            permission,
            reason: "No authenticated Electron window session"
          })
        });
      }
      throw new Error("Your desktop session is not signed in. Please sign in again.");
    }
    if (typeof enforcePermission !== "function") {
      throw new Error("Desktop permission enforcement is unavailable.");
    }
    return enforcePermission(db, permission, {
      ...context,
      user_id: session.user_id
    });
  }

  return {
    bindSession,
    clearSession,
    clearUserSessions,
    getSession,
    markPasswordChanged,
    requirePermission
  };
}
