import React from "react";
import { EmptyState } from "../common.jsx";

export function SettingsPanel({
  backups,
  updateStatus,
  updateLoading,
  autoUpdateStatus,
  autoUpdateLoading,
  updateProgress,
  isDownloading,
  onCreateBackup,
  onRestoreBackup,
  onRefreshUpdates,
  onOpenUpdateFolder,
  onInstallUpdate,
  onCheckAutoUpdates,
  onStartDownload,
  onInstallAutoUpdate
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
      <AutoUpdaterSection
        autoUpdateStatus={autoUpdateStatus}
        autoUpdateLoading={autoUpdateLoading}
        updateLoading={updateLoading}
        updateProgress={updateProgress}
        isDownloading={isDownloading}
        onCheckAutoUpdates={onCheckAutoUpdates}
        onStartDownload={onStartDownload}
        onInstallAutoUpdate={onInstallAutoUpdate}
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
        <p>Local database safety, offline folders, restore controls and update management.</p>
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
    ["Update Status", updateStatus?.updateAvailable ? "Update available" : "No newer package detected", updateStatus?.manifestError || updateStatus?.source || "Manual check"]
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

export function AutoUpdaterSection({
  autoUpdateStatus,
  autoUpdateLoading,
  updateLoading,
  updateProgress,
  isDownloading,
  onCheckAutoUpdates,
  onStartDownload,
  onInstallAutoUpdate
}) {
  const progress = Math.min(100, Math.max(0, Number(updateProgress) || 0));
  const busy = autoUpdateLoading || updateLoading || isDownloading;
  const statusLabel = {
    unavailable: "Unavailable",
    idle: "Ready",
    checking: "Checking...",
    current: "Up to date",
    available: "Update available",
    downloading: "Downloading...",
    downloaded: "Ready to install",
    error: "Needs attention"
  }[autoUpdateStatus?.status] || "Loading...";

  return (
    <>
      <div className="section-title">Automatic Updates</div>
      <div className="settings-grid">
        <div className="settings-card">
          <strong>Status</strong>
          <span aria-live="polite">{statusLabel}</span>
          <small>{autoUpdateStatus?.error || autoUpdateStatus?.message || "Loading update status..."}</small>
        </div>
        <div className="settings-card">
          <strong>Version</strong>
          <span>{autoUpdateStatus?.availableVersion || autoUpdateStatus?.currentVersion || "-"}</span>
          <small>{autoUpdateStatus?.availableVersion ? `Installed: ${autoUpdateStatus.currentVersion || "-"}` : "Installed version"}</small>
        </div>
      </div>
      {(isDownloading || autoUpdateStatus?.status === "downloading") && updateProgress !== null ? (
        <div className="backup-row">
          <div
            className="progress-bar-container"
            role="progressbar"
            aria-label="Update download progress"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={Math.round(progress)}
            style={{ flex: 1, background: "#e0e0e0", borderRadius: 4, height: 20, overflow: "hidden" }}
          >
            <div className="progress-bar-fill" style={{ width: `${progress}%`, background: "#4caf50", height: "100%", transition: "width 0.3s" }} />
          </div>
          <span style={{ marginLeft: 8 }}>{Math.round(progress)}%</span>
        </div>
      ) : null}
      <div className="backup-row">
        <div className="update-actions">
          <button onClick={onCheckAutoUpdates} disabled={busy || !autoUpdateStatus?.canCheck}>Check for Updates</button>
          {autoUpdateStatus?.canDownload ? (
            <button className="primary-btn" onClick={onStartDownload} disabled={busy}>Download Update</button>
          ) : null}
          {autoUpdateStatus?.canInstall ? (
            <button className="primary-btn" onClick={onInstallAutoUpdate}>Install Now</button>
          ) : null}
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
