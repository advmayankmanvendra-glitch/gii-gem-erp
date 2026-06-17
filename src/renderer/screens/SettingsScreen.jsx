import React, { useEffect, useState } from "react";
import { isDesktopRuntime } from "../api/client.js";
import { EmptyState } from "../components/common.jsx";

export function SettingsScreen({ notify, apiClient, confirmAction }) {
  const [backups, setBackups] = useState([]);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateLoading, setUpdateLoading] = useState(false);

  async function refresh() {
    try {
      const rows = await apiClient.listBackups();
      const normalized = normalizeBackups(rows);
      setBackups(normalized);
      return normalized;
    } catch (error) {
      notify(error.message, "error");
      return [];
    }
  }

  useEffect(() => {
    refresh();
    refreshUpdates({ silent: true });
  }, []);

  async function refreshUpdates(options = {}) {
    if (!isDesktopRuntime) {
      setUpdateStatus({
        currentVersion: "Browser preview",
        latestVersion: "Desktop app required",
        releaseNotes: "Manual updates are available only inside the Windows desktop app.",
        updateFolder: "",
        installerFileName: "",
        installerPath: ""
      });
      return null;
    }
    try {
      setUpdateLoading(true);
      const status = await apiClient.getUpdateStatus();
      setUpdateStatus(status);
      if (!options.silent) notify("Update status refreshed");
      return status;
    } catch (error) {
      if (!options.silent) notify(error.message, "error");
      setUpdateStatus({ currentVersion: "-", latestVersion: "-", releaseNotes: error.message, updateFolder: "", installerPath: "" });
      return null;
    } finally {
      setUpdateLoading(false);
    }
  }

  async function backup() {
    const confirmed = await confirmAction({
      mode: "normal",
      title: "Create Backup",
      message: "Do you want to create a backup of the current database?",
      confirmLabel: "Yes, Backup",
      cancelLabel: "No, Cancel",
      moduleName: "settings"
    });
    if (!confirmed.confirmed) return;
    try {
      const target = await apiClient.createBackup();
      const rows = await refresh();
      const createdName = backupFileName(target);
      if (createdName && !rows.some((file) => file.name === createdName)) {
        throw new Error("Backup was requested, but the new backup file was not found in the backup list.");
      }
      notify(`Backup created${createdName ? `: ${createdName}` : ""}`);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function restore(file) {
    const confirmed = await confirmAction({
      mode: "danger",
      title: "Restore Backup",
      message: "Restoring backup will replace the current database. Please ensure current data is backed up. Do you want to continue?",
      confirmLabel: "Yes, Restore",
      cancelLabel: "No, Cancel",
      moduleName: "settings",
      recordId: file
    });
    if (!confirmed.confirmed) return;
    try {
      await apiClient.restoreBackup(backupFileName(file));
      notify("Backup restored. Restart the app to reload all data.");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function openUpdateFolder() {
    try {
      await apiClient.openUpdateFolder();
      notify("Update folder opened");
      await refreshUpdates({ silent: true });
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function installUpdate() {
    if (!updateStatus?.installerPath) {
      notify("No update installer was found in the update folder.", "error");
      return;
    }
    const confirmed = await confirmAction({
      mode: "warning",
      title: "Install Update",
      message: "This will open the selected GII GeM ERP update installer. Save your work before continuing.",
      confirmLabel: "Yes, Install",
      cancelLabel: "No, Cancel",
      moduleName: "settings"
    });
    if (!confirmed.confirmed) return;
    try {
      await apiClient.installUpdate(updateStatus.installerPath);
      notify("Update installer opened");
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-head">
        <div>
          <h2>Settings</h2>
          <p>Local database safety, offline folders, restore controls and manual updates.</p>
        </div>
        <button className="primary-btn" onClick={backup}>Create Backup</button>
      </div>
      <div className="settings-grid">
        <div className="settings-card">
          <strong>Database</strong>
          <span>SQLite: gii_gem_erp.db</span>
          <small>Stored locally in the database folder.</small>
        </div>
        <div className="settings-card">
          <strong>Documents</strong>
          <span>PDF, images, XLSX and CSV</span>
          <small>Stored company/module/year wise.</small>
        </div>
        <div className="settings-card">
          <strong>Backups</strong>
          <span>{backups.length} backup file(s)</span>
          <small>Create backups before bulk import or restore.</small>
        </div>
        <div className="settings-card">
          <strong>Offline Mode</strong>
          <span>Windows desktop ready</span>
          <small>No cloud dependency for core ERP data.</small>
        </div>
      </div>
      <div className="section-title">Manual Internal Updater</div>
      <div className="settings-grid">
        <div className="settings-card">
          <strong>Current Version</strong>
          <span>{updateStatus?.currentVersion || "-"}</span>
          <small>Installed app version.</small>
        </div>
        <div className="settings-card">
          <strong>Latest Available</strong>
          <span>{updateStatus?.latestVersion || "No update package found"}</span>
          <small>{updateStatus?.installerFileName || "Place installer EXE in the update folder."}</small>
        </div>
        <div className="settings-card">
          <strong>Update Folder</strong>
          <span>{updateStatus?.updateFolder || "Windows desktop app only"}</span>
          <small>Store internal update installers and latest.json here.</small>
        </div>
        <div className="settings-card">
          <strong>Update Status</strong>
          <span>{updateStatus?.updateAvailable ? "Update available" : "No newer package detected"}</span>
          <small>{updateStatus?.manifestError || updateStatus?.source || "Manual check"}</small>
        </div>
      </div>
      <div className="backup-row">
        <span style={{ whiteSpace: "pre-wrap" }}>{updateStatus?.releaseNotes || "Check the update folder for release notes."}</span>
        <div className="update-actions">
          <button onClick={() => refreshUpdates()} disabled={updateLoading}>{updateLoading ? "Checking..." : "Check Updates"}</button>
          <button onClick={openUpdateFolder}>Open Update Folder</button>
          <button className="primary-btn" onClick={installUpdate} disabled={!updateStatus?.installerPath}>Install Update</button>
        </div>
      </div>
      <div className="section-title">Backup and Restore</div>
      {backups.length ? (
        <div className="backup-list">
          {backups.map((file) => (
            <div className="backup-row" key={file.name}>
              <span>{file.name}{file.size ? ` (${Math.round(file.size / 1024)} KB)` : ""}</span>
              <button onClick={() => restore(file)}>Restore</button>
            </div>
          ))}
        </div>
      ) : <EmptyState title="No backups yet" note="Create the first local database backup." />}
    </section>
  );
}

function backupFileName(file) {
  if (!file) return "";
  if (typeof file === "string") return file.split(/[\\/]/).pop();
  return file.fileName || file.name || "";
}

function normalizeBackups(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((file) => {
      if (typeof file === "string") return { name: backupFileName(file), size: 0, createdAt: "" };
      return { name: backupFileName(file), size: Number(file.size || 0), createdAt: file.createdAt || file.lastModified || "" };
    })
    .filter((file) => file.name);
}
