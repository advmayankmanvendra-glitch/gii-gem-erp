// Main-process login session. The renderer can no longer choose which user an action runs as:
// IPC handlers read the actor from here, set only by a successful auth:login.
let currentUser = null;

export function startSession(user) {
  if (!user?.id) {
    currentUser = null;
    return null;
  }
  currentUser = {
    id: Number(user.id),
    username: user.username || "",
    role: user.role || "",
    mustChangePassword: Boolean(user.forcePasswordChange)
  };
  return currentUser;
}

export function endSession() {
  currentUser = null;
}

export function sessionUser() {
  return currentUser;
}

export function completePasswordChange(userId) {
  if (currentUser && Number(currentUser.id) === Number(userId)) {
    currentUser = { ...currentUser, mustChangePassword: false };
  }
}

export function activeSessionUserId() {
  return currentUser && !currentUser.mustChangePassword ? currentUser.id : null;
}

export function requireActiveSession() {
  if (!currentUser) {
    throw new Error("You are not logged in. Log in again from the login screen to continue; your last action was not saved.");
  }
  if (currentUser.mustChangePassword) {
    throw new Error("Password change pending. Change your password on the login screen before opening ERP data.");
  }
  return currentUser;
}
