import React, { useEffect, useState } from "react";
import { EmptyState } from "../common.jsx";

function updateStatusLabel(status) {
  if (status?.portableNotSupported) return "Portable EXE found: it does not update the installed app. Use the Setup installer.";
  if (status?.updateAvailable) return "Update available";
  if (status?.sameVersion) return "Installer found, but it is the same version as this app";
  if (status?.olderVersion) return "Installer found, but it is older than this app";
  return "No newer package detected";
}

export function SettingsPanel({
  backups,
  updateStatus,
  updateLoading,
  onCreateBackup,
  onRestoreBackup,
  onRefreshUpdates,
  onOpenUpdateFolder,
  onInstallUpdate
}) {
  return (
    <section className="panel settings-panel">
      <SettingsHeader onCreateBackup={onCreateBackup} />
      <SettingsOverview backups={backups} />
      <UpdaterSection
        updateStatus={updateStatus}
        updateLoading={updateLoading}
        onRefreshUpdates={onRefreshUpdates}
        onOpenUpdateFolder={onOpenUpdateFolder}
        onInstallUpdate={onInstallUpdate}
      />
      <BackupRestoreSection backups={backups} onRestoreBackup={onRestoreBackup} />
    </section>
  );
}

export function SettingsHeader({ onCreateBackup }) {
  return (
    <div className="panel-head">
      <div>
        <h2>Settings</h2>
        <p>Local database safety, offline folders, restore controls and manual updates.</p>
      </div>
      <button className="primary-btn" onClick={onCreateBackup}>Create Backup</button>
    </div>
  );
}

export function SettingsOverview({ backups }) {
  const cards = [
    ["Database", "SQLite: gii_gem_erp.db", "Stored locally in the database folder."],
    ["Documents", "PDF, images, XLSX and CSV", "Stored company/module/year wise."],
    ["Backups", `${backups.length} backup file(s)`, "Create backups before bulk import or restore."],
    ["Offline Mode", "Windows desktop ready", "No cloud dependency for core ERP data."]
  ];

  return (
    <div className="settings-grid">
      {cards.map(([title, value, note]) => (
        <SettingsCard key={title} title={title} value={value} note={note} />
      ))}
    </div>
  );
}

export function UpdaterSection({
  updateStatus,
  updateLoading,
  onRefreshUpdates,
  onOpenUpdateFolder,
  onInstallUpdate
}) {
  const cards = [
    ["Current Version", updateStatus?.currentVersion || "-", "Installed app version."],
    ["Latest Available", updateStatus?.latestVersion || "No update package found", updateStatus?.installerFileName || "Place installer EXE in the update folder."],
    ["Update Folder", updateStatus?.updateFolder || "Windows desktop app only", "Store internal update installers and latest.json here."],
    ["Update Status", updateStatusLabel(updateStatus), updateStatus?.manifestError || updateStatus?.source || "Manual check"]
  ];

  return (
    <>
      <div className="section-title">Manual Internal Updater</div>
      <div className="settings-grid">
        {cards.map(([title, value, note]) => (
          <SettingsCard key={title} title={title} value={value} note={note} />
        ))}
      </div>
      <div className="backup-row">
        <span style={{ whiteSpace: "pre-wrap" }}>{updateStatus?.releaseNotes || "Check the update folder for release notes."}</span>
        <div className="update-actions">
          <button onClick={() => onRefreshUpdates()} disabled={updateLoading}>{updateLoading ? "Checking..." : "Check Updates"}</button>
          <button onClick={onOpenUpdateFolder}>Open Update Folder</button>
          <button className="primary-btn" onClick={onInstallUpdate} disabled={!updateStatus?.installerPath}>Install Update</button>
        </div>
      </div>
    </>
  );
}

export function BackupRestoreSection({ backups, onRestoreBackup }) {
  return (
    <>
      <div className="section-title">Backup and Restore</div>
      {backups.length ? (
        <div className="backup-list">
          {backups.map((file) => (
            <div className="backup-row" key={file.name}>
              <span>{file.name}{file.size ? ` (${Math.round(file.size / 1024)} KB)` : ""}</span>
              <button onClick={() => onRestoreBackup(file)}>Restore</button>
            </div>
          ))}
        </div>
      ) : <EmptyState title="No backups yet" note="Create the first local database backup." />}
    </>
  );
}

export function SettingsCard({ title, value, note }) {
  return (
    <div className="settings-card">
      <strong>{title}</strong>
      <span>{value}</span>
      <small>{note}</small>
    </div>
  );
}

export function SecuritySection({ apiClient, notify, confirmAction, userId, isAdmin }) {
  const [recovery, setRecovery] = useState({ currentPassword: "", recoverySecret: "", confirmSecret: "" });
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [tempPassword, setTempPassword] = useState("");

  async function loadUsers() {
    if (!isAdmin) return;
    setUsersLoading(true);
    try {
      setUsers(await apiClient.listUsers());
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  async function saveRecoverySecret(event) {
    event.preventDefault();
    if (recovery.recoverySecret !== recovery.confirmSecret) {
      notify("Recovery secret and confirmation do not match", "error");
      return;
    }
    setRecoveryLoading(true);
    try {
      const result = await apiClient.setRecoverySecret({
        user_id: userId,
        current_password: recovery.currentPassword,
        recovery_secret: recovery.recoverySecret
      });
      notify(result.recoverySecretSet ? "Recovery secret saved." : "Recovery secret cleared.", "success");
      setRecovery({ currentPassword: "", recoverySecret: "", confirmSecret: "" });
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function clearRecoverySecret() {
    const confirmed = await confirmAction({
      mode: "warning",
      title: "Clear Recovery Secret",
      message: "Do you want to remove your recovery secret? You will no longer be able to reset a forgotten password yourself.",
      confirmLabel: "Yes, Clear",
      cancelLabel: "No, Cancel",
      moduleName: "settings"
    });
    if (!confirmed.confirmed) return;
    setRecoveryLoading(true);
    try {
      await apiClient.setRecoverySecret({
        user_id: userId,
        current_password: recovery.currentPassword,
        clear: true
      });
      notify("Recovery secret cleared.", "success");
      setRecovery({ currentPassword: "", recoverySecret: "", confirmSecret: "" });
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function submitAdminReset(event) {
    event.preventDefault();
    if (!resetTarget) return;
    const confirmed = await confirmAction({
      mode: "danger",
      title: `Reset Password for ${resetTarget.username}`,
      message: "This will replace the user's password with a temporary one. The user must change it at the next login. Do you want to continue?",
      confirmLabel: "Yes, Reset",
      cancelLabel: "No, Cancel",
      moduleName: "settings",
      recordId: resetTarget.id
    });
    if (!confirmed.confirmed) return;
    try {
      const result = await apiClient.adminResetPassword({
        user_id: resetTarget.id,
        new_password: tempPassword
      });
      notify(`Password reset for ${result.username}. The user must change it at the next login.`, "success");
      setResetTarget(null);
      setTempPassword("");
      loadUsers();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-head">
        <div>
          <h2>Security</h2>
          <p>Recovery secret for forgotten passwords and administrator password reset.</p>
        </div>
      </div>

      <div className="section-title">Your Recovery Secret</div>
      <div className="backup-row">
        <span style={{ whiteSpace: "pre-wrap" }}>
          A recovery secret lets you reset a forgotten password from the login screen without administrator help.
          Set it once while signed in, then keep it private.
        </span>
      </div>
      <form className="security-form" onSubmit={saveRecoverySecret}>
        <label>
          Current Password
          <input type="password" value={recovery.currentPassword} onChange={(event) => setRecovery({ ...recovery, currentPassword: event.target.value })} required />
        </label>
        <label>
          New Recovery Secret
          <input type="password" value={recovery.recoverySecret} onChange={(event) => setRecovery({ ...recovery, recoverySecret: event.target.value })} required />
        </label>
        <label>
          Confirm Recovery Secret
          <input type="password" value={recovery.confirmSecret} onChange={(event) => setRecovery({ ...recovery, confirmSecret: event.target.value })} required />
        </label>
        <div className="update-actions">
          <button className="primary-btn" disabled={recoveryLoading}>{recoveryLoading ? "Saving..." : "Save Recovery Secret"}</button>
          <button type="button" onClick={clearRecoverySecret} disabled={recoveryLoading}>Clear Recovery Secret</button>
        </div>
        <p className="hint">Use at least 8 characters with uppercase, lowercase and a number. It must be different from your login password.</p>
      </form>

      {isAdmin && (
        <>
          <div className="section-title">Reset User Passwords</div>
          {usersLoading ? (
            <p className="hint">Loading users...</p>
          ) : users.length ? (
            <div className="backup-list">
              {users.map((user) => (
                <div className="backup-row" key={user.id}>
                  <span>
                    {user.username} ({user.display_name || "—"}) — {user.role}
                    {Number(user.force_password_change || 0) ? " (must change password)" : ""}
                  </span>
                  <button disabled={Number(user.id) === Number(userId)} onClick={() => { setResetTarget(user); setTempPassword(""); }}>
                    {Number(user.id) === Number(userId) ? "Yourself" : "Reset Password"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No users found" note="User accounts are listed here for password reset." />
          )}

          {resetTarget && (
            <form className="security-form" onSubmit={submitAdminReset}>
              <div className="empty-state compact">
                <strong>Set Temporary Password for {resetTarget.username}</strong>
                <span>Share the temporary password privately. The user will be forced to change it at the next login.</span>
              </div>
              <label>
                Temporary Password
                <input type="password" value={tempPassword} onChange={(event) => setTempPassword(event.target.value)} required />
              </label>
              <div className="update-actions">
                <button className="primary-btn">Reset Password</button>
                <button type="button" onClick={() => { setResetTarget(null); setTempPassword(""); }}>Cancel</button>
              </div>
              <p className="hint">Use at least 8 characters with uppercase, lowercase and a number.</p>
            </form>
          )}
        </>
      )}
    </section>
  );
}
