import { useState } from "react";

export function LoginScreen({ onLogin, notify, toast, api }) {
  const [credentials, setCredentials] = useState({ username: "admin", password: "" });
  const [pendingUser, setPendingUser] = useState(null);
  const [passwordChange, setPasswordChange] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [recovery, setRecovery] = useState({ username: "admin", recoverySecret: "", newPassword: "", confirmPassword: "" });
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const mustChangePassword = Boolean(pendingUser?.forcePasswordChange);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const user = await api.login(credentials);
      if (!user) {
        notify("Invalid username or password", "error");
        return;
      }
      if (user.forcePasswordChange) {
        setPendingUser(user);
        setPasswordChange({ currentPassword: credentials.password, newPassword: "", confirmPassword: "" });
        notify("Please change the default admin password before continuing.", "warning");
        return;
      }
      onLogin(user);
    } catch (error) {
      notify(error.message || "Login failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function submitPasswordChange(event) {
    event.preventDefault();
    if (passwordChange.newPassword !== passwordChange.confirmPassword) {
      notify("New password and confirmation do not match", "error");
      return;
    }
    setLoading(true);
    try {
      const user = await api.changePassword({
        user_id: pendingUser.id,
        current_password: passwordChange.currentPassword,
        new_password: passwordChange.newPassword
      });
      notify("Password changed. Login session started.", "success");
      onLogin(user);
    } catch (error) {
      notify(error.message || "Password change failed", "error");
    } finally {
      setLoading(false);
    }
  }

  async function submitRecovery(event) {
    event.preventDefault();
    if (recovery.newPassword !== recovery.confirmPassword) {
      notify("New password and confirmation do not match", "error");
      return;
    }
    setLoading(true);
    try {
      await api.recoveryResetPassword({
        username: recovery.username,
        recovery_secret: recovery.recoverySecret,
        new_password: recovery.newPassword
      });
      notify("Password reset. Signing you in.", "success");
      const user = await api.login({ username: recovery.username, password: recovery.newPassword });
      if (user) {
        onLogin(user);
      } else {
        setRecoveryMode(false);
        setCredentials({ ...credentials, username: recovery.username, password: "" });
        notify("Please sign in with your new password.", "success");
      }
    } catch (error) {
      notify(error.message || "Recovery reset failed", "error");
    } finally {
      setLoading(false);
    }
  }

  function switchToRecovery() {
    setRecoveryMode(true);
    setRecovery({ ...recovery, username: credentials.username || "admin" });
  }

  function switchToLogin() {
    setRecoveryMode(false);
  }

  return (
    <div className="login-page">
      <form
        className="login-card"
        onSubmit={mustChangePassword ? submitPasswordChange : recoveryMode ? submitRecovery : submit}
      >
        <div className="brand login-brand">
          <div className="brand-mark">G</div>
          <div>
            <strong>GII GeM ERP</strong>
            <span>Government Supply, Procurement & Profitability Management System</span>
          </div>
        </div>
        {mustChangePassword ? (
          <>
            <div className="empty-state compact">
              <strong>Change Default Password</strong>
              <span>Create a private administrator password before opening company data.</span>
            </div>
            <label>
              Current Password
              <input
                type="password"
                value={passwordChange.currentPassword}
                onChange={(event) => setPasswordChange({ ...passwordChange, currentPassword: event.target.value })}
                required
              />
            </label>
            <label>
              New Password
              <input
                type="password"
                value={passwordChange.newPassword}
                onChange={(event) => setPasswordChange({ ...passwordChange, newPassword: event.target.value })}
                required
              />
            </label>
            <label>
              Confirm New Password
              <input
                type="password"
                value={passwordChange.confirmPassword}
                onChange={(event) => setPasswordChange({ ...passwordChange, confirmPassword: event.target.value })}
                required
              />
            </label>
            <button className="primary-btn" disabled={loading}>{loading ? "Saving..." : "Change Password & Continue"}</button>
            <p className="hint">Use at least 8 characters with uppercase, lowercase and a number.</p>
          </>
        ) : recoveryMode ? (
          <>
            <div className="empty-state compact">
              <strong>Reset Forgotten Password</strong>
              <span>Enter your username, recovery secret and a new password. The recovery secret was set from the Settings screen while signed in.</span>
            </div>
            <label>
              Username
              <input
                value={recovery.username}
                onChange={(event) => setRecovery({ ...recovery, username: event.target.value })}
                required
              />
            </label>
            <label>
              Recovery Secret
              <input
                type="password"
                value={recovery.recoverySecret}
                onChange={(event) => setRecovery({ ...recovery, recoverySecret: event.target.value })}
                required
              />
            </label>
            <label>
              New Password
              <input
                type="password"
                value={recovery.newPassword}
                onChange={(event) => setRecovery({ ...recovery, newPassword: event.target.value })}
                required
              />
            </label>
            <label>
              Confirm New Password
              <input
                type="password"
                value={recovery.confirmPassword}
                onChange={(event) => setRecovery({ ...recovery, confirmPassword: event.target.value })}
                required
              />
            </label>
            <button className="primary-btn" disabled={loading}>{loading ? "Resetting..." : "Reset Password & Sign In"}</button>
            <button type="button" className="link-btn" onClick={switchToLogin}>Back to login</button>
            <p className="hint">If you do not have a recovery secret, ask an administrator to reset your password.</p>
          </>
        ) : (
          <>
            <label>
              Username
              <input value={credentials.username} onChange={(event) => setCredentials({ ...credentials, username: event.target.value })} required />
            </label>
            <label>
              Password
              <input type="password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} required />
            </label>
            <button className="primary-btn" disabled={loading}>{loading ? "Checking..." : "Login"}</button>
            <button type="button" className="link-btn" onClick={switchToRecovery}>Forgot password?</button>
            <p className="hint">First login on a new installation uses the default admin account given in the installation guide. You must set your own password before the ERP opens.</p>
          </>
        )}
      </form>
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
