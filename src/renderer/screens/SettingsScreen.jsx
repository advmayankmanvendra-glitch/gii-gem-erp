import React, { useEffect, useState } from "react";
import { isDesktopRuntime } from "../api/client.js";
import { SettingsPanel } from "../components/settings/index.jsx";

export function SettingsScreen({ notify, apiClient, confirmAction }) {
  const [backups, setBackups] = useState([]);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [autoUpdateStatus, setAutoUpdateStatus] = useState(null);
  const [autoUpdateLoading, setAutoUpdateLoading] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

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
    refreshAutoUpdateStatus({ silent: true });
  }, []);

  useEffect(() => {
    if (!isDesktopRuntime || typeof apiClient.onUpdateDownloadProgress !== "function") return undefined;
    const cleanup = apiClient.onUpdateDownloadProgress((progress) => {
      const normalized = Math.min(100, Math.max(0, Number(progress) || 0));
      setUpdateProgress(normalized);
      setIsDownloading(normalized < 100);
      setAutoUpdateStatus((current) => current ? {
        ...current,
        status: normalized < 100 ? "downloading" : "downloaded",
        progress: normalized,
        message: normalized < 100
          ? `Downloading update: ${Math.round(normalized)}%`
          : "The update is ready to install.",
        canCheck: false,
        canDownload: false,
        canInstall: normalized >= 100
      } : current);
    });
    return typeof cleanup === "function" ? cleanup : undefined;
  }, [apiClient]);

  async function refreshAutoUpdateStatus(options = {}) {
    if (!isDesktopRuntime) {
      const previewStatus = {
        isUpdaterActive: false,
        status: "unavailable",
        message: "Automatic updates are available in the installed Windows desktop app.",
        canCheck: false,
        canDownload: false,
        canInstall: false,
        progress: 0
      };
      setAutoUpdateStatus(previewStatus);
      return previewStatus;
    }
    try {
      const status = await apiClient.getAutoUpdateStatus();
      setAutoUpdateStatus(status);
      setUpdateProgress(Number(status?.progress || 0));
      setIsDownloading(status?.status === "downloading");
      return status;
    } catch (error) {
      if (!options.silent) notify(error.message, "error");
      return null;
    }
  }

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

  async function checkAutoUpdates() {
    try {
      setAutoUpdateLoading(true);
      setUpdateProgress(null);
      const result = await apiClient.checkForUpdates();
      setAutoUpdateStatus(result);
      setUpdateProgress(Number(result?.progress || 0));
      if (result?.status === "available") {
        notify(result.message || "An update is available.");
      } else if (result?.status === "current") {
        notify("This installation is up to date.");
      } else if (result?.status === "unavailable") {
        notify(result.message, "error");
      }
    } catch (error) {
      notify(error.message, "error");
      await refreshAutoUpdateStatus({ silent: true });
    } finally {
      setAutoUpdateLoading(false);
    }
  }

  async function startDownload() {
    if (!autoUpdateStatus?.canDownload) {
      notify("Check for updates before starting a download.", "error");
      return;
    }
    try {
      setIsDownloading(true);
      setUpdateProgress(0);
      const result = await apiClient.downloadUpdate();
      setAutoUpdateStatus(result);
      setUpdateProgress(Number(result?.progress || 100));
      notify(result?.message || "Update downloaded successfully.");
    } catch (error) {
      notify(error.message, "error");
      await refreshAutoUpdateStatus({ silent: true });
    } finally {
      setIsDownloading(false);
    }
  }

  async function installAutoUpdate() {
    if (!autoUpdateStatus?.canInstall) {
      notify("No downloaded update is ready to install.", "error");
      return;
    }
    const confirmed = await confirmAction({
      mode: "warning",
      title: "Install Update",
      message: "The app will quit and install the update. Save your work before continuing.",
      confirmLabel: "Yes, Install Now",
      cancelLabel: "Cancel",
      moduleName: "settings"
    });
    if (!confirmed.confirmed) return;
    try {
      await apiClient.quitAndInstall();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <SettingsPanel
      backups={backups}
      updateStatus={updateStatus}
      updateLoading={updateLoading}
      autoUpdateStatus={autoUpdateStatus}
      autoUpdateLoading={autoUpdateLoading}
      updateProgress={updateProgress}
      isDownloading={isDownloading}
      onCreateBackup={backup}
      onRestoreBackup={restore}
      onRefreshUpdates={refreshUpdates}
      onOpenUpdateFolder={openUpdateFolder}
      onInstallUpdate={installUpdate}
      onCheckAutoUpdates={checkAutoUpdates}
      onStartDownload={startDownload}
      onInstallAutoUpdate={installAutoUpdate}
    />
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
