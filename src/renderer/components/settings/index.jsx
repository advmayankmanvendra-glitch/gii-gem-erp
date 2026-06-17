import React from "react";
import { EmptyState } from "../common.jsx";

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
