import React from "react";

export function RuntimeBanner({ isDesktopRuntime }) {
  if (isDesktopRuntime) return null;
  return (
    <div className="runtime-banner">
      <strong>Browser Preview Only:</strong> this screen is not connected to the SQLite desktop database. Real saving, posting, backup, restore, uploads and accounting entries require opening GII GeM ERP in the Windows Electron desktop app.
    </div>
  );
}

export function TrainingModeBanner({ trainingMode }) {
  if (!trainingMode) return null;
  return (
    <div className="training-banner">
      <strong>Training Mode:</strong> sample guidance is active. Live accounting data is not changed by the training workspace.
    </div>
  );
}

export function ToastNotification({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.type}`}>{toast.message}</div>
  );
}

export function SidebarScrim({ onClose }) {
  return (
    <button className="sidebar-scrim" type="button" aria-label="Close menu" onClick={onClose} />
  );
}
