import updaterPackage from "electron-updater";
import { app, BrowserWindow } from "electron";
import path from "node:path";
import fs from "node:fs";
import { dataRoot } from "../database/databasePathResolver.js";

const { autoUpdater } = updaterPackage;
const TRUSTED_UPDATE_HOST = "releases.gestureindia.com";

let configured = false;
let updaterState = {
  isUpdaterActive: false,
  status: "unavailable",
  channel: "stable",
  currentVersion: "",
  availableVersion: "",
  downloadedVersion: "",
  updateAvailable: false,
  progress: 0,
  message: "Automatic updates are available in installed builds.",
  error: "",
  lastCheckedAt: ""
};

function updateLogPath() {
  return path.join(dataRoot(), "logs", "auto-update.log");
}

function log(message) {
  try {
    const logPath = updateLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch {}
}

function normalizeChannel(channel) {
  const value = String(channel || "stable").trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(value)) {
    throw new Error("The configured update channel is invalid.");
  }
  return value;
}

function trustedFeedUrl(repoUrl) {
  if (!repoUrl) return "";
  const parsed = new URL(repoUrl);
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== TRUSTED_UPDATE_HOST) {
    throw new Error(`The update feed must use https://${TRUSTED_UPDATE_HOST}.`);
  }
  return parsed.toString();
}

function clampProgress(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, numeric));
}

function setState(patch) {
  updaterState = { ...updaterState, ...patch };
  return getUpdaterStatus();
}

function publicError(error) {
  const message = String(error?.message || error || "Update operation failed.");
  return message.replace(/^Error:\s*/i, "");
}

function sendProgress(percent) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send("update:download-progress", percent);
    }
  });
}

export function configureUpdater(options = {}) {
  if (configured) return getUpdaterStatus();

  const channel = normalizeChannel(options.channel);
  const enabled = Boolean(options.enabled);
  const repoUrl = trustedFeedUrl(options.repoUrl);
  configured = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  setState({
    isUpdaterActive: enabled,
    status: enabled ? "idle" : "unavailable",
    channel,
    currentVersion: app.getVersion(),
    message: enabled
      ? "Ready to check for updates."
      : "Automatic updates are available in installed builds.",
    error: ""
  });

  if (!enabled) {
    log(`Updater disabled outside packaged runtime: channel=${channel}`);
    return getUpdaterStatus();
  }

  if (repoUrl) {
    autoUpdater.setFeedURL({ provider: "generic", url: repoUrl });
  }
  autoUpdater.channel = channel;
  log(`Updater configured: channel=${channel}, repo=${repoUrl || "packaged configuration"}`);

  autoUpdater.on("checking-for-update", () => {
    setState({ status: "checking", message: "Checking for updates...", error: "" });
    log("Checking for update...");
  });

  autoUpdater.on("update-available", (info) => {
    const version = String(info?.version || "");
    setState({
      status: "available",
      availableVersion: version,
      updateAvailable: true,
      progress: 0,
      message: version ? `Version ${version} is available.` : "An update is available.",
      error: ""
    });
    log(`Update available: ${version || "unknown version"}`);
  });

  autoUpdater.on("update-not-available", () => {
    setState({
      status: "current",
      availableVersion: "",
      downloadedVersion: "",
      updateAvailable: false,
      progress: 0,
      message: "This installation is up to date.",
      error: ""
    });
    log("No update available.");
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = clampProgress(progress?.percent);
    setState({
      status: "downloading",
      progress: percent,
      message: `Downloading update: ${Math.round(percent)}%`,
      error: ""
    });
    sendProgress(percent);
    log(`Download: ${Math.round(percent)}%`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    const version = String(info?.version || updaterState.availableVersion || "");
    setState({
      status: "downloaded",
      downloadedVersion: version,
      updateAvailable: true,
      progress: 100,
      message: version ? `Version ${version} is ready to install.` : "The update is ready to install.",
      error: ""
    });
    sendProgress(100);
    log(`Update downloaded: ${version || "unknown version"}`);
  });

  autoUpdater.on("error", (error) => {
    const message = publicError(error);
    setState({ status: "error", message: "The update operation failed.", error: message });
    log(`Update error: ${message}`);
  });

  return getUpdaterStatus();
}

export async function checkForUpdates() {
  if (!updaterState.isUpdaterActive) return getUpdaterStatus();

  setState({
    status: "checking",
    message: "Checking for updates...",
    error: "",
    lastCheckedAt: new Date().toISOString()
  });
  log("Manual update check triggered.");

  try {
    const result = await autoUpdater.checkForUpdates();
    if (result?.isUpdateAvailable) {
      const version = String(result.updateInfo?.version || updaterState.availableVersion || "");
      setState({
        status: "available",
        availableVersion: version,
        updateAvailable: true,
        message: version ? `Version ${version} is available.` : "An update is available.",
        error: ""
      });
    } else if (updaterState.status === "checking") {
      setState({
        status: "current",
        availableVersion: "",
        updateAvailable: false,
        message: "This installation is up to date.",
        error: ""
      });
    }
    return getUpdaterStatus();
  } catch (error) {
    const message = publicError(error);
    setState({ status: "error", message: "The update check failed.", error: message });
    log(`Update check failed: ${message}`);
    throw new Error(`Unable to check for updates. ${message}`);
  }
}

export async function downloadUpdate() {
  if (!updaterState.isUpdaterActive) {
    throw new Error("Automatic updates are available only in an installed desktop build.");
  }
  if (!updaterState.updateAvailable) {
    throw new Error("Check for updates before starting a download.");
  }
  if (updaterState.status === "downloaded") return getUpdaterStatus();

  setState({ status: "downloading", progress: 0, message: "Starting update download...", error: "" });
  try {
    await autoUpdater.downloadUpdate();
    if (updaterState.status !== "downloaded") {
      setState({ status: "downloaded", progress: 100, message: "The update is ready to install.", error: "" });
    }
    return getUpdaterStatus();
  } catch (error) {
    const message = publicError(error);
    setState({ status: "error", message: "The update download failed.", error: message });
    log(`Update download failed: ${message}`);
    throw new Error(`Unable to download the update. ${message}`);
  }
}

export function quitAndInstall() {
  if (!updaterState.isUpdaterActive || updaterState.status !== "downloaded") {
    throw new Error("No downloaded update is ready to install.");
  }
  log(`Installing update: ${updaterState.downloadedVersion || updaterState.availableVersion || "unknown version"}`);
  autoUpdater.quitAndInstall(false, true);
  return { accepted: true };
}

export function getUpdaterStatus() {
  const state = { ...updaterState };
  return {
    ...state,
    canCheck: state.isUpdaterActive && !["checking", "downloading", "downloaded"].includes(state.status),
    canDownload: state.isUpdaterActive && state.updateAvailable && !["downloading", "downloaded"].includes(state.status),
    canInstall: state.isUpdaterActive && state.status === "downloaded"
  };
}
