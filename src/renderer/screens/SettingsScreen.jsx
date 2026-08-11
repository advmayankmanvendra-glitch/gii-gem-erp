import React, { useEffect, useState } from "react";
import { isDesktopRuntime } from "../api/client.js";
import { SettingsPanel, SecuritySection } from "../components/settings/index.jsx";

export function SettingsScreen({ notify, apiClient, confirmAction, role, userId }) {
  const [backups, setBackups] = useState([]);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const isAdmin = ["admin", "super_admin"].includes(role);

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
    <>
      <SettingsPanel
        backups={backups}
        updateStatus={updateStatus}
        updateLoading={updateLoading}
        onCreateBackup={backup}
        onRestoreBackup={restore}
        onRefreshUpdates={refreshUpdates}
        onOpenUpdateFolder={openUpdateFolder}
        onInstallUpdate={installUpdate}
      />
      <SecuritySection
        apiClient={apiClient}
        notify={notify}
        confirmAction={confirmAction}
        userId={userId}
        isAdmin={isAdmin}
      />
    </>
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
