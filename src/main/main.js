import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  authenticate,
  accountingData,
  approveStockAdjustment,
  approveTransaction,
  adjustAdvanceReceipt,
  adjustSupplierAdvance,
  auditLog,
  runAsActor,
  currentActor as ambientActor,
  receivableOutstandingForSettlement,
  roleCan,
  enforceBankDetailPermission,
  verifyAuditChain,
  alertServiceWith,
  autoReserveOrderStock,
  bankStatementData,
  billingVoucherData,
  bulkImportRecords,
  closeFinancialYear,
  confirmDeliveryChallan,
  convertPurchaseOrderToWorkOrder,
  createBankStatementImport,
  createBusinessVoucher,
  createDeliveryChallan,
  createFinancialYear,
  enforcePermission,
  createManualVoucher,
  createOpeningBalance,
  createAdvanceReceipt,
  createPartyOpeningBalance,
  createRecord,
  createDraftVoucherFromProposal,
  createReceiptAllocation,
  createSupplierAdvance,
  createSupplierPaymentAllocation,
  createWarehouseTransfer,
  dashboardCounts,
  deleteDocument,
  deleteItemImportBatch,
  deleteRecord,
  deleteUnusedImportedItems,
  drilldownData,
  initializeDatabase,
  inventoryData,
  listDocuments,
  listImportBatches,
  listItemImportBatches,
  listRecords,
  MASTER_TABLES,
  orderProfitability,
  parseImportBuffer,
  parseImportFile,
  postApprovedBankImport,
  postDraftVoucherFromProposal,
  previewTallyMasterMigration,
  previewTallyStockXml,
  previewBankStatementImport,
  postBusinessTransaction,
  postGuidedVoucher,
  postStockAdjustment,
  postStockInward,
  postStockOutward,
  postStockReturn,
  postWarehouseTransfer,
  referenceData,
  reallocateReceiptAllocation,
  reallocateSupplierPaymentAllocation,
  replaceDocument,
  reverseVoucher,
  rollbackImportBatch,
  rejectVoucherProposal,
  manualBankEntryMatch,
  reverseAdvanceAdjustment,
  saveBillingVoucher,
  saveCreditTerm,
  TRANSACTION_TABLES,
  unallocateReceiptAllocation,
  unallocateSupplierPaymentAllocation,
  uploadDocument,
  approveVoucherProposal,
  generateVoucherProposalsForImport,
  getAccountClassifications,
  getAccountMappingCoverage,
  getAccountMappingRegistry,
  getAccountMappingReviewQueue,
  createMappedLedgerAccount,
  updateVoucherProposal,
  updateFinancialYearStatus,
  updateBankImportStatus,
  updateRecord,
  updateGuidedVoucherStatus,
  assignAccountGroup,
  APP_FOLDERS,
  DB_NAME,
  changeUserPassword,
  setRecoverySecret,
  recoveryResetPassword,
  adminResetPassword,
  ensureAppFolders,
  setRuntimeRoot,
  sourceProjectRoot,
  voucherProposalData,
  previewImportRollback
} from "./database/init.js";
import { masterImportTouchesBankDetails } from "./services/bankDetailsPolicy.js";
import { applyPendingRestore, createLiveBackup, listBackups, preparePendingRestore, restoreBackup } from "./services/backup.js";
import { getHealthDiagnostics, runHealthChecks } from "./services/healthService.js";
import { clearErrorJournal, errorConsoleState, recordError } from "./services/errorConsoleService.js";
import { dbPath } from "./database/connection.js";
import { previewReset, executeReset, analyzeDependencies, executeEnhancedReset, rollbackReset } from "./services/operationalResetService.js";
import { generateCertificate } from "./services/productionReadinessService.js";
import {
  confirmMasterDataUpdate,
  exportMasterData,
  getMasterDataCompleteness,
  getMasterDataToolDefinitions,
  getMasterDataToolsHealth,
  previewMasterDataUpdate
} from "./services/masterDataToolsService.js";
import { createSupportBundle } from "./services/supportBundleService.js";
import { getVerificationConsoleState, recordVerificationSnapshot } from "./services/verificationService.js";
import { PROFILES } from "./config/verificationConfig.js";
import { calculateReadinessScore } from "./services/deployment/readinessService.js";
import { generateGoLiveCertificate, getCertificateHistory } from "./services/deployment/certificationService.js";
import { ROLLBACK_REFUSED, assertGoLiveRollbackSafe, checkGoLivePreconditions, previewGoLive, executeGoLiveReset, verifyGoLiveProduction, completeGoLive, failGoLiveWithRollback } from "./services/deployment/goLiveService.js";
import { getGoLiveHistory } from "./services/deployment/goLiveHistoryService.js";
import {
  listCracRecords,
  getCracRecord,
  createCracRecord,
  updateCracRecord,
  deleteCracRecord,
  getCracStats
} from "./services/cracService.js";
import { getPaymentReadinessReport, getOrdersBilledWithoutCrac, getPaymentDelayedOrders } from "./services/paymentReadinessService.js";
import { computeOrderClosure, markOrderOperationallyClosed, getClosurePendingOrders } from "./services/orderClosureService.js";
import { profitSimulation } from "./services/profitSimulatorService.js";
import { submitFeedback, listFeedback, exportFeedback } from "./services/feedbackService.js";
import { searchEntities, SUPPORTED_ENTITY_TYPES } from "./services/entitySearchService.js";
import { createDesktopSessionService } from "./services/desktopSessionService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let db;
let runtimeDataRoot = "";
const desktopSessions = createDesktopSessionService({
  auditLog,
  enforcePermission
});

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("disable-accelerated-2d-canvas");
app.commandLine.appendSwitch("in-process-gpu");

if (!app.isPackaged) {
  try {
    const devUserDataRoot = path.join(sourceProjectRoot(), "runtime", "electron-user-data");
    fs.mkdirSync(devUserDataRoot, { recursive: true });
    app.setPath("userData", devUserDataRoot);
    app.setPath("sessionData", path.join(devUserDataRoot, "session"));
  } catch {
    // Falling back to Electron defaults is safer than blocking app startup.
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

function safeMainLog(level, message) {
  try {
    const root = runtimeDataRoot || sourceProjectRoot();
    const logDir = path.join(root, "logs");
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, "electron-renderer.log"), `[${new Date().toISOString()}] ${level} ${message}\n`);
  } catch {
    // Diagnostics must never crash the main process.
  }
}

// Only a plain object counts as a payload; a byte array or other typed object is never
// copied key by key (a large one would hold the app before the permission check).
function firstPayload(args) {
  return args.find((arg) => arg && typeof arg === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(arg))) || {};
}

// The audit trail is a report; roles without report access do not receive it. Admins
// (who hold settings rather than view_reports) keep it.
function seesAuditTrail(actor) {
  return Boolean(actor && (roleCan(actor.role, "view_reports") || roleCan(actor.role, "settings")));
}

function userContext(args, fallback = {}) {
  const payload = firstPayload(args);
  const userId = payload.user_id || payload.userId || payload.created_by || payload.uploaded_by || payload.imported_by || null;
  return { ...fallback, ...payload, user_id: userId };
}

function configuredDataRoot() {
  if (process.env.GII_GEM_ERP_DATA_ROOT) {
    return path.resolve(process.env.GII_GEM_ERP_DATA_ROOT);
  }
  return app.isPackaged ? app.getPath("userData") : sourceProjectRoot();
}

function copyBundledDatabaseIfNeeded(targetRoot) {
  const targetDb = path.join(targetRoot, "database", DB_NAME);
  if (!app.isPackaged || fs.existsSync(targetDb)) {
    return null;
  }

  const candidates = [
    path.join(process.resourcesPath || "", "database", DB_NAME),
    path.join(app.getAppPath(), "database", DB_NAME),
    path.join(path.dirname(app.getPath("exe")), "database", DB_NAME)
  ];
  const sourceDb = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!sourceDb) {
    return null;
  }

  fs.mkdirSync(path.dirname(targetDb), { recursive: true });
  fs.copyFileSync(sourceDb, targetDb);
  return { source: sourceDb, target: targetDb };
}

function configureRuntimeStorage() {
  runtimeDataRoot = setRuntimeRoot(configuredDataRoot());
  APP_FOLDERS.forEach((folder) => {
    fs.mkdirSync(path.join(runtimeDataRoot, folder), { recursive: true });
  });
  const copiedDatabase = copyBundledDatabaseIfNeeded(runtimeDataRoot);
  ensureAppFolders(runtimeDataRoot);
  return { root: runtimeDataRoot, copiedDatabase };
}

// Files the user picked in a native file dialog during this run. Only these can
// be read by path, so a screen cannot read arbitrary files from the disk.
const selectedFiles = new Set();

// The signed-in user for the IPC call being handled right now. There is one source:
// handle() runs every signed-in call inside runAsActor (init.js AsyncLocalStorage), so
// services, audit rows and this helper all see the same user, across awaits too.
function actorId() {
  return ambientActor()?.id || null;
}

// Alert passwords and tokens are kept only in the operating system's secure storage.
const alerts = alertServiceWith({
  encryptSecret: (value) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure storage is not available on this computer, so the alert password or token cannot be saved. Sign in to Windows with your own account and try again.");
    return safeStorage.encryptString(String(value)).toString("base64");
  },
  decryptSecret: (value) => safeStorage.decryptString(Buffer.from(String(value), "base64"))
});
let alertTimer = null;

const ACTOR_FIELDS = ["user_id", "userId", "created_by", "uploaded_by", "imported_by", "approved_by", "deleted_by", "posted_by"];

// Overwrite every "who did this" field the screen sent with the signed-in user,
// so the audit trail can never name somebody else.
function withActor(value, user) {
  // Only plain objects carry "who did this" fields; arrays, byte buffers and other
  // objects pass through unchanged.
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const next = { ...value };
  ACTOR_FIELDS.forEach((field) => {
    if (field in next || field === "user_id") next[field] = user.id;
  });
  next.user_role = user.role;
  return next;
}

function assertSelectedFile(filePath) {
  if (!selectedFiles.has(path.resolve(String(filePath || "")))) {
    throw new Error("File refused: choose the file with the Browse button first. Only files picked in the file dialog can be read.");
  }
  return filePath;
}

function sessionUser(event) {
  const session = desktopSessions.getSession(event?.sender?.id);
  if (!session) {
    throw new Error("You are not signed in. Sign in again from the login screen, then retry this action.");
  }
  // The database file can be swapped under a live session (restore, reset rollback,
  // go-live rollback). Re-check the user on every call so a session never outlives
  // its user or maps onto a different person in the restored file.
  const user = db?.prepare("SELECT username, role, status FROM users WHERE id = ?").get(session.user_id);
  if (!user || user.status !== "active" || (session.username && user.username !== session.username)) {
    desktopSessions.clearSession(event?.sender?.id);
    throw new Error("Your sign-in is no longer valid for this database (it was restored, or your user was changed or disabled). Sign in again from the login screen.");
  }
  return { ...session, role: user.role };
}

function guarded(permission, moduleName, handler) {
  return (event, ...args) => {
    const session = sessionUser(event);
    const payload = firstPayload(args);
    const user = enforcePermission(db, permission, {
      ...payload,
      module: moduleName,
      table_name: moduleName,
      user_id: session.user_id
    });
    const safeArgs = args.map((arg) => withActor(arg, user));
    recordGrant(user, permission, moduleName, payload);
    return runAsActor(user, () => handler(...safeArgs));
  };
}

// Permissions whose every use is recorded with the signed-in user (SEC-1).
const AUDITED_GRANTS = new Set(["system_reset", "restore_backup", "settings", "financial_year_close", "financial_year_reopen", "account_mapping"]);

// High-impact permissions record who was allowed, as refusals already do. Both guard
// wrappers call this, so no channel for these permissions goes unrecorded.
function recordGrant(user, permission, moduleName, payload = {}) {
  if (!AUDITED_GRANTS.has(permission)) return;
  runAsActor(user, () => auditLog(db, { company_id: payload.company_id || null, user_id: user.id, action: "permission_granted", module: moduleName, table_name: "system", new_value: JSON.stringify({ permission, module: moduleName }) }));
}

function sessionGuarded(permission, moduleName, handler) {
  return (event, ...args) => {
    const payload = firstPayload(args);
    const user = desktopSessions.requirePermission(
      db,
      event.sender.id,
      permission,
      {
        ...payload,
        module: moduleName,
        table_name: moduleName
      }
    );
    recordGrant(user, permission, moduleName, payload);
    // Handlers take (payload, actor). Only the first argument is passed on, so an extra
    // argument from a screen can never take the actor's place.
    return handler(args[0], {
      user_id: user.id,
      user_role: user.role
    });
  };
}

function sessionRequired(handler) {
  return (event, ...args) => {
    const session = desktopSessions.getSession(event.sender.id);
    if (!session) {
      throw new Error("Your desktop session is not signed in. Please sign in again.");
    }
    return handler(...args, {
      user_id: session.user_id,
      user_role: session.role
    });
  };
}

// Runs a step that replaces the database file. The shared connection is closed
// first and always reopened afterwards, so no stale handle can corrupt the file.
function withDatabaseClosed(step) {
  db?.close();
  db = null;
  try {
    return step();
  } finally {
    db = initializeDatabase(runtimeDataRoot);
  }
}

function escapePrintHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safePrintFileName(value) {
  return String(value || "GII-GeM-ERP")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "GII-GeM-ERP";
}

function ensureUpdateFolder() {
  const configured = process.env.GII_GEM_ERP_UPDATE_DIR;
  const baseFolder = configured
    ? path.resolve(configured)
    : path.join(app.getPath("documents"), "GII GeM ERP Updates");
  fs.mkdirSync(baseFolder, { recursive: true });
  return baseFolder;
}

function parseUpdateVersion(fileName = "") {
  const match = String(fileName).match(/^GII-GeM-ERP-(?:Setup|Portable)-(.+?)-x64\.exe$/i);
  return match?.[1] || "";
}

function compareUpdateVersions(left = "", right = "") {
  const leftParts = String(left).match(/\d+/g)?.map(Number) || [0];
  const rightParts = String(right).match(/\d+/g)?.map(Number) || [0];
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (delta !== 0) return delta;
  }
  return String(left).localeCompare(String(right));
}

function safeReadUpdateManifest(manifestPath) {
  try {
    if (!fs.existsSync(manifestPath)) return null;
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return { error: `latest.json could not be read: ${error.message}` };
  }
}

function environmentConfigPath() {
  return path.join(runtimeDataRoot, "environment-config.json");
}

function readEnvironmentConfig() {
  const configPath = environmentConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
  } catch { /* return defaults */ }
  return { environment: "Development", verificationProfile: "Development" };
}

function writeEnvironmentConfig(config) {
  const configPath = environmentConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function findLatestUpdateInstaller(updateFolder, manifest) {
  const manifestFileName = manifest?.fileName || manifest?.installerFileName || manifest?.installer;
  if (manifestFileName) {
    const fileName = path.basename(manifestFileName);
    const installerPath = path.join(updateFolder, fileName);
    return fs.existsSync(installerPath)
      ? { fileName, installerPath, version: manifest.version || parseUpdateVersion(fileName), source: "manifest" }
      : { fileName, installerPath: "", version: manifest.version || parseUpdateVersion(fileName), source: "manifest", missing: true };
  }

  const candidates = fs.readdirSync(updateFolder)
    .filter((fileName) => /^GII-GeM-ERP-(?:Setup|Portable)-.+-x64\.exe$/i.test(fileName))
    .map((fileName) => {
      const installerPath = path.join(updateFolder, fileName);
      const stats = fs.statSync(installerPath);
      return { fileName, installerPath, version: parseUpdateVersion(fileName), modifiedAt: stats.mtimeMs, source: "folder" };
    })
    .sort((left, right) => compareUpdateVersions(right.version, left.version) || right.modifiedAt - left.modifiedAt);

  return candidates[0] || null;
}

function updateReleaseNotes(manifest, candidate) {
  if (Array.isArray(manifest?.releaseNotes)) return manifest.releaseNotes.join("\n");
  if (typeof manifest?.releaseNotes === "string") return manifest.releaseNotes;
  if (typeof manifest?.notes === "string") return manifest.notes;
  if (candidate?.fileName) return `Manual update package found: ${candidate.fileName}`;
  return "Place a GII GeM ERP installer EXE in the update folder, optionally with latest.json release notes.";
}

function getUpdateStatus() {
  const updateFolder = ensureUpdateFolder();
  const manifestPath = path.join(updateFolder, "latest.json");
  const manifest = safeReadUpdateManifest(manifestPath);
  const candidate = findLatestUpdateInstaller(updateFolder, manifest?.error ? null : manifest);
  const currentVersion = app.getVersion();
  const latestVersion = manifest?.version || candidate?.version || "";
  return {
    currentVersion,
    latestVersion,
    updateAvailable: Boolean(candidate?.installerPath && latestVersion && compareUpdateVersions(latestVersion, currentVersion) > 0),
    updateFolder,
    manifestPath,
    releaseNotes: updateReleaseNotes(manifest, candidate),
    installerFileName: candidate?.fileName || "",
    installerPath: candidate?.installerPath || "",
    installerMissing: Boolean(candidate?.missing),
    manifestError: manifest?.error || "",
    source: candidate?.source || "none"
  };
}

function assertInstallerInsideUpdateFolder(installerPath, updateFolder) {
  const resolvedFolder = path.resolve(updateFolder);
  const resolvedInstaller = path.resolve(installerPath || "");
  if (!resolvedInstaller.startsWith(`${resolvedFolder}${path.sep}`)) {
    throw new Error("Selected installer is outside the approved update folder.");
  }
  if (!/\.exe$/i.test(resolvedInstaller)) {
    throw new Error("Only Windows EXE update installers can be launched.");
  }
  if (!fs.existsSync(resolvedInstaller)) {
    throw new Error("Update installer file was not found.");
  }
  return resolvedInstaller;
}

function buildPrintDocument(preview = {}) {
  const title = escapePrintHtml(preview.title || "GII GeM ERP");
  const subtitle = escapePrintHtml(preview.subtitle || "");
  const breadcrumb = escapePrintHtml(preview.breadcrumb || "");
  const generatedAt = escapePrintHtml(preview.generatedAt || new Date().toLocaleString("en-IN"));
  const content = preview.html || "";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #061b2b; font-family: Arial, sans-serif; font-size: 12px; background: #fff; }
    .print-page-header { display: flex; justify-content: space-between; gap: 18px; padding-bottom: 12px; border-bottom: 2px solid #082235; margin-bottom: 16px; }
    .print-page-header strong { color: #f59a23; font-size: 12px; }
    .print-page-header h1 { margin: 3px 0; font-size: 22px; }
    .print-page-header p, .print-page-header small, .print-page-header span { margin: 0; color: #536477; font-size: 11px; }
    .print-page-header > div:last-child { max-width: 290px; text-align: right; }
    .panel, section { break-inside: avoid; margin-bottom: 12px; }
    .panel { border: 1px solid #d5e0e8; border-radius: 6px; padding: 12px; box-shadow: none !important; }
    .table-wrap, .billing-grid-scroll, .invoice-grid-wrap { overflow: visible !important; max-width: 100% !important; }
    table { width: 100%; border-collapse: collapse; table-layout: auto; }
    th, td { border-bottom: 1px solid #d5e0e8; padding: 6px 7px; text-align: left; vertical-align: top; word-break: break-word; }
    th { background: #f5f8fb; color: #394b5f; font-size: 10px; text-transform: uppercase; }
    input, select, textarea, button, .button-row, .toolbar-controls, .productivity-panel, .runtime-banner, .training-banner { display: none !important; }
    .print-field-value { display: inline-block; min-height: 24px; min-width: 64px; padding: 4px 7px; border: 1px solid #d5e0e8; border-radius: 4px; background: #f8fbfd; white-space: pre-wrap; }
    .status-pill, .badge { display: inline-block; padding: 2px 7px; border-radius: 999px; background: #e8f4ee; color: #087240; font-weight: 700; }
    .billing-layout, .billing-main-layout, .voucher-layout, .transaction-layout, .workflow-layout, .dashboard-grid { display: block !important; }
  </style>
</head>
<body>
  <article>
    <header class="print-page-header">
      <div>
        <strong>GII GeM ERP</strong>
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
      <div>
        <span>${generatedAt}</span>
        <small>${breadcrumb}</small>
      </div>
    </header>
    <main>${content}</main>
  </article>
</body>
</html>`;
}

async function withPrintWindow(event, preview, worker) {
  const parent = BrowserWindow.fromWebContents(event.sender);
  const printWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    parent,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildPrintDocument(preview))}`);
    return await worker(printWindow);
  } finally {
    if (!printWindow.isDestroyed()) printWindow.close();
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    title: "GII GeM ERP",
    backgroundColor: "#f4f8fb",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const senderId = win.webContents.id;

  // The signed-in session is bound to this window, so it must never show another page:
  // block navigation away from the app and refuse new windows.
  const devOrigin = process.env.VITE_DEV_SERVER_URL ? new URL(process.env.VITE_DEV_SERVER_URL).origin : null;
  const appIndex = path.join(app.isPackaged ? app.getAppPath() : sourceProjectRoot(), "dist", "index.html");
  win.webContents.on("will-navigate", (event, url) => {
    let allowed = false;
    try {
      const target = new URL(url);
      allowed = devOrigin ? target.origin === devOrigin : target.protocol === "file:" && path.resolve(fileURLToPath(target)) === path.resolve(appIndex);
    } catch { allowed = false; }
    if (!allowed) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(appIndex);
  }

  win.webContents.on("console-message", (details) => {
    if (["warning", "error"].includes(details?.level)) {
      safeMainLog("warn", `[renderer:${details.level}] ${details.message} (${details.sourceId}:${details.lineNumber})`);
    }
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    safeMainLog("error", `[renderer-load-failed] ${errorCode} ${errorDescription} ${validatedURL}`);
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    safeMainLog("error", `[renderer-process-gone] ${JSON.stringify(details)}`);
  });

  win.webContents.on("destroyed", () => {
    desktopSessions.clearSession(senderId);
  });

  win.webContents.on("before-input-event", (event, input) => {
    const command = desktopShortcutCommand(input);
    if (command) {
      event.preventDefault();
      win.webContents.send("app:desktop-shortcut", command);
    }
  });

  win.on("close", (event) => {
    event.preventDefault();
    win.webContents.send("app:confirm-close");
  });
}

ipcMain.handle("app:force-close", () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (win) win.destroy();
});

function desktopShortcutCommand(input = {}) {
  const key = String(input.key || "");
  const lower = key.toLowerCase();
  const ctrl = Boolean(input.control || input.meta);
  const alt = Boolean(input.alt);
  const shift = Boolean(input.shift);

  if (ctrl && shift && !alt) {
    const shiftCommands = { b: "backup-create", r: "backup-restore", p: "production-health", l: "audit-log" };
    return shiftCommands[lower] || null;
  }

  if (ctrl && !alt && !shift) {
    if (/^[1-9]$/.test(lower)) return `nav-${lower}`;
    const ctrlCommands = {
      s: "save",
      n: "new-record",
      e: "edit-or-export",
      f: "focus-search",
      p: "print-preview",
      r: "refresh",
      b: "settings",
      k: "global-search"
    };
    return ctrlCommands[lower] || null;
  }

  if (alt && !ctrl && !shift) {
    if (key === "Home") return "dashboard";
    const altCommands = {
      r: "voucher-receipt",
      p: "voucher-supplier-payment",
      s: "voucher-sales",
      u: "voucher-purchase",
      j: "voucher-journal",
      c: "voucher-contra",
      n: "voucher-credit-note",
      d: "voucher-debit-note",
      i: "inventory-issue",
      g: "inventory-receipt",
      t: "inventory-transfer",
      a: "inventory-adjustment"
    };
    return altCommands[lower] || null;
  }

  if (!ctrl && !alt && !shift && /^F([1-9]|1[0-2])$/.test(key)) return key.toLowerCase();
  return null;
}

function sendShortcutCommand(command) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return;
  win.webContents.send("app:desktop-shortcut", command);
}

function installApplicationMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "ERP Print Preview",
          accelerator: "CommandOrControl+P",
          click: () => sendShortcutCommand("print-preview")
        },
        { type: "separator" },
        { role: "quit", label: "Exit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Keyboard Shortcuts",
          accelerator: "F1",
          click: () => sendShortcutCommand("f1")
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Channels that may be called before anyone signs in. Everything else needs a
// signed-in desktop session, and a session whose password must still be changed
// can only change it.
const PUBLIC_CHANNELS = new Set([
  "auth:login",
  "auth:logout",
  "auth:recovery-reset",
  "meta:masters",
  "meta:transactions",
  "master-data:definitions",
  "updates:status",
  "environment:get-profiles"
]);
const UI_AUDIT_ACTIONS = new Set(["screen_context", "company_scope_changed", "company_switched", "import company mapping approval"]);
const PASSWORD_CHANGE_CHANNELS = new Set(["auth:change-password", "auth:logout"]);

function handle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    // Every failure is journaled for the Error Console, then re-thrown unchanged.
    const journal = (error) => {
      recordError(runtimeDataRoot, {
        channel,
        message: error?.message || String(error),
        user_id: desktopSessions.getSession?.(event.sender.id)?.user_id || null,
        company_id: firstPayload(args).company_id || null
      });
      throw error;
    };
    try {
      let result;
      if (!PUBLIC_CHANNELS.has(channel)) {
        const session = sessionUser(event);
        if (session.force_password_change && !PASSWORD_CHANGE_CHANNELS.has(channel)) {
          throw new Error("Change your password first. The ERP opens fully once the first-login password change on the login screen is saved.");
        }
        result = runAsActor({ id: session.user_id, role: session.role }, () => handler(event, ...args));
      } else {
        result = handler(event, ...args);
      }
      return result && typeof result.then === "function" ? result.catch(journal) : result;
    } catch (error) {
      return journal(error);
    }
  });
}

function registerIpc() {
  handle("auth:login", (event, credentials) => {
    const user = authenticate(db, credentials.username, credentials.password);
    if (user) desktopSessions.bindSession(event.sender.id, user);
    else desktopSessions.clearSession(event.sender.id);
    return user;
  });
  handle("auth:logout", (event) => {
    desktopSessions.clearSession(event.sender.id);
    return { success: true };
  });
  handle("auth:change-password", (event, payload) => {
    const session = sessionUser(event);
    const user = changeUserPassword(db, { ...payload, user_id: session.user_id, username: "" });
    desktopSessions.markPasswordChanged(event.sender.id);
    return user;
  });
  handle("auth:set-recovery-secret", (event, payload) => {
    const session = sessionUser(event);
    return setRecoverySecret(db, { ...payload, user_id: session.user_id, username: "" });
  });
  handle("auth:recovery-reset", (_event, payload) => {
    return recoveryResetPassword(db, payload);
  });
  handle("auth:admin-reset-password", (event, payload) => {
    return sessionGuarded("settings", "security", (resolvedPayload, actor) => {
      const result = adminResetPassword(db, resolvedPayload, actor);
      desktopSessions.clearUserSessions(resolvedPayload?.user_id);
      return result;
    })(event, payload);
  });
  handle("auth:list-users", (event) => {
    return sessionGuarded("settings", "security", () => {
      const rows = db.prepare(`
        SELECT id, username, display_name, role, status, force_password_change,
               last_login_at, password_changed_at, created_at
        FROM users
        ORDER BY id
      `).all();
      return rows.map((row) => ({
        ...row,
        has_recovery_secret: Boolean(db.prepare("SELECT recovery_secret_hash FROM users WHERE id = ?").get(row.id)?.recovery_secret_hash)
      }));
    })(event);
  });

  handle("meta:masters", () => MASTER_TABLES);
  handle("meta:transactions", () => TRANSACTION_TABLES);
  handle("master-data:definitions", () => getMasterDataToolDefinitions());
  handle("dashboard:counts", (_event, filters) => dashboardCounts(db, filters));
  handle("references:list", (_event, filters) => referenceData(db, filters));
  handle("profitability:list", (_event, filters) => orderProfitability(db, filters));
  // What-if figures for the Profit Simulator; reads the same report, saves nothing.
  handle("profitability:simulate", (_event, filters, params) => profitSimulation(orderProfitability(db, filters) || [], params || {}));
  handle("accounting:data", (_event, filters) => {
    const data = accountingData(db, filters);
    return seesAuditTrail(ambientActor()) ? data : { ...data, auditLog: [] };
  });
  handle(
    "account-mapping:registry",
    sessionGuarded("account_mapping", "account_mapping", (filters) => (
      getAccountMappingRegistry(db, filters)
    ))
  );
  handle(
    "account-mapping:classifications",
    sessionGuarded("account_mapping", "account_mapping", (filters) => (
      getAccountClassifications(db, filters)
    ))
  );
  handle(
    "account-mapping:coverage",
    sessionGuarded("account_mapping", "account_mapping", (filters) => (
      getAccountMappingCoverage(db, filters)
    ))
  );
  handle(
    "account-mapping:review-queue",
    sessionGuarded("account_mapping", "account_mapping", (filters) => (
      getAccountMappingReviewQueue(db, filters)
    ))
  );
  handle(
    "account-mapping:assign",
    sessionGuarded("account_mapping", "account_mapping", (payload, actor) => (
      assignAccountGroup(db, payload, actor)
    ))
  );
  handle("bank:data", (_event, filters) => bankStatementData(db, filters));
  handle("bank:preview-import", guarded("import", "bank_statement_imports", (payload) => previewBankStatementImport(db, payload)));
  handle("bank:create-import", guarded("import", "bank_statement_imports", (payload) => createBankStatementImport(db, payload)));
  handle("bank:status", guarded("approve", "bank_statement_imports", (importId, status, _userId, remarks) => updateBankImportStatus(db, importId, status, actorId(), remarks)));
  handle("bank:manual-match", guarded("edit", "bank_statement_entries", (entryId, payload) => manualBankEntryMatch(db, entryId, payload)));
  handle("bank:post-approved", guarded("post", "bank_statement_imports", (importId) => postApprovedBankImport(db, importId, actorId())));
  handle("voucher-proposals:data", (_event, filters) => voucherProposalData(db, filters));
  handle("voucher-proposals:generate", guarded("approve", "voucher_proposals", (importId) => generateVoucherProposalsForImport(db, importId, actorId())));
  handle("voucher-proposals:update", guarded("edit", "voucher_proposals", (proposalId, payload) => updateVoucherProposal(db, proposalId, { ...(payload || {}), user_id: actorId() })));
  handle("voucher-proposals:approve", guarded("approve", "voucher_proposals", (proposalId, _userId, remarks) => approveVoucherProposal(db, proposalId, actorId(), remarks)));
  handle("voucher-proposals:reject", guarded("approve", "voucher_proposals", (proposalId, _userId, reason) => rejectVoucherProposal(db, proposalId, actorId(), reason)));
  handle("voucher-proposals:create-draft", guarded("create", "voucher_proposals", (proposalId) => createDraftVoucherFromProposal(db, proposalId, actorId())));
  handle("voucher-proposals:post-draft", guarded("post", "voucher_proposals", (proposalId) => postDraftVoucherFromProposal(db, proposalId, actorId())));
  handle("billing:data", (_event, filters) => billingVoucherData(db, filters));
  handle("billing:save", guarded("create", "billing", (payload) => saveBillingVoucher(db, payload)));
  handle("inventory:data", (_event, filters) => inventoryData(db, filters));
  handle("inventory:post-inward", guarded("post", "stock_inwards", (id) => postStockInward(db, id)));
  handle("inventory:post-outward", guarded("post", "stock_outwards", (id) => postStockOutward(db, id)));
  handle("inventory:post-adjustment", guarded("post", "stock_adjustments", (id) => postStockAdjustment(db, id)));
  handle("inventory:post-return", guarded("post", "stock_returns", (id) => postStockReturn(db, id)));
  handle("inventory:approve-adjustment", guarded("approve", "stock_adjustments", (id, _userId, remarks) => approveStockAdjustment(db, id, actorId(), remarks)));
  handle("inventory:auto-reserve-order", guarded("edit", "stock_reservations", (orderId) => autoReserveOrderStock(db, orderId)));
  handle("inventory:create-delivery-challan", guarded("create", "delivery_challans", (payload) => createDeliveryChallan(db, payload)));
  handle("inventory:confirm-delivery-challan", guarded("post", "delivery_challans", (id) => confirmDeliveryChallan(db, id, actorId())));
  handle("inventory:create-transfer", guarded("create", "warehouse_transfers", (payload) => createWarehouseTransfer(db, payload)));
  handle("inventory:post-transfer", guarded("post", "warehouse_transfers", (id) => postWarehouseTransfer(db, id, actorId())));
  handle("allocations:receipt-create", guarded("edit", "payment_allocations", (payload) => createReceiptAllocation(db, payload)));
  handle("allocations:receipt-unallocate", guarded("reverse", "payment_allocations", (allocationId, reason) => unallocateReceiptAllocation(db, allocationId, reason)));
  handle("allocations:receipt-reallocate", guarded("edit", "payment_allocations", (allocationId, payload) => reallocateReceiptAllocation(db, allocationId, payload)));
  handle("allocations:supplier-create", guarded("edit", "supplier_payment_allocations", (payload) => createSupplierPaymentAllocation(db, payload)));
  handle("allocations:supplier-unallocate", guarded("reverse", "supplier_payment_allocations", (allocationId, reason) => unallocateSupplierPaymentAllocation(db, allocationId, reason)));
  handle("allocations:supplier-reallocate", guarded("edit", "supplier_payment_allocations", (allocationId, payload) => reallocateSupplierPaymentAllocation(db, allocationId, payload)));
  handle("advances:receipt-create", guarded("create", "advance_receipts", (payload) => createAdvanceReceipt(db, payload)));
  handle("advances:supplier-create", guarded("create", "supplier_advances", (payload) => createSupplierAdvance(db, payload)));
  handle("advances:receipt-adjust", guarded("edit", "advance_receipts", (payload) => adjustAdvanceReceipt(db, payload)));
  handle("advances:supplier-adjust", guarded("edit", "supplier_advances", (payload) => adjustSupplierAdvance(db, payload)));
  handle("advances:adjustment-reverse", guarded("reverse", "advance_adjustments", (adjustmentId, reason) => reverseAdvanceAdjustment(db, adjustmentId, reason, actorId())));
  handle("credit-terms:save", guarded("settings", "credit_terms", (payload) => saveCreditTerm(db, payload)));
  handle("party-opening:create", guarded("opening_balance", "party_opening_balances", (payload) => createPartyOpeningBalance(db, payload)));
  handle("vouchers:create", guarded("post", "vouchers", (payload) => createManualVoucher(db, payload)));
  handle("vouchers:create-business", guarded("create", "guided_vouchers", (payload) => createBusinessVoucher(db, payload)));
  handle("vouchers:guided-status", guarded("approve", "guided_vouchers", (id, action, _userId, remarks) => updateGuidedVoucherStatus(db, id, action, actorId(), remarks)));
  handle("vouchers:guided-post", guarded("post", "guided_vouchers", (id) => postGuidedVoucher(db, id, actorId())));
  handle("vouchers:reverse", guarded("reverse", "vouchers", (voucherId, reason) => reverseVoucher(db, voucherId, reason, actorId())));
  handle("posting:post", guarded("post", "posting", (moduleName, recordId) => postBusinessTransaction(db, moduleName, recordId)));
  handle("approval:approve", guarded("approve", "approval_queue", (moduleName, recordId, _userId, remarks) => approveTransaction(db, moduleName, recordId, actorId(), remarks)));
  handle("financial-years:create", guarded("settings", "financial_years", (payload) => createFinancialYear(db, payload)));
  handle("financial-years:status", guarded("financial_year_close", "financial_years", (id, status) => updateFinancialYearStatus(db, id, status, actorId())));
  handle("opening-balances:create", guarded("opening_balance", "opening_balances", (payload) => createOpeningBalance(db, payload)));
  handle("accounting:drilldown", (_event, payload) => {
    const data = drilldownData(db, payload);
    // A voucher's audit rows are part of the audit trail, shown on the same terms as accounting:data.
    return data?.voucher && !seesAuditTrail(ambientActor()) ? { ...data, voucher: { ...data.voucher, audit: [] } } : data;
  });
  handle("financial-years:close", guarded("financial_year_close", "financial_years", (payload) => closeFinancialYear(db, payload)));
  handle("imports:parse-file", guarded("import", "imports", (filePath) => {
    if (!selectedFiles.has(path.resolve(String(filePath || "")))) {
      throw new Error("Import refused: choose the file with the Browse button first. Only files picked in the file dialog can be read.");
    }
    return parseImportFile(filePath);
  }));
  handle("imports:parse-buffer", guarded("import", "imports", (fileName, bytes) => parseImportBuffer(fileName, bytes)));
  handle("imports:select-file", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select import file",
      properties: ["openFile"],
      filters: [{ name: "Excel or CSV", extensions: ["xlsx", "xls", "csv"] }]
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    selectedFiles.add(path.resolve(result.filePaths[0]));
    return { path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
  });
  handle("tally:select-xml-file", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select Tally Prime XML export",
      properties: ["openFile"],
      filters: [{ name: "Tally XML", extensions: ["xml"] }]
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    selectedFiles.add(path.resolve(result.filePaths[0]));
    return { path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
  });
  handle("tally:select-migration-file", async (_event, type) => {
    const result = await dialog.showOpenDialog({
      title: "Select Tally migration or reference file",
      properties: ["openFile"],
      filters: [{ name: "Tally XML, Excel or CSV", extensions: ["xml", "xlsx", "xls", "csv"] }]
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    selectedFiles.add(path.resolve(result.filePaths[0]));
    return { path: result.filePaths[0], name: path.basename(result.filePaths[0]), type: type || "" };
  });
  handle("tally:preview-stock-xml", guarded("import", "tally_xml_import", (payload) => previewTallyStockXml(assertSelectedFile(typeof payload === "string" ? payload : payload?.filePath))));
  handle("tally:preview-master-migration", guarded("import", "tally_migration_assistant", (payload) => previewTallyMasterMigration(db, (payload?.files || []).map((file) => ({ ...file, filePath: assertSelectedFile(file?.filePath) })), userContext([payload], { module: "tally_migration_assistant" }))));
  handle("imports:confirm", guarded("import", "imports", (table, rows, context) => bulkImportRecords(db, table, rows, context)));
  handle("imports:batches", (_event, filters) => listImportBatches(db, filters));
  handle("imports:rollback-preview", (_event, batchId) => previewImportRollback(db, batchId));
  handle("imports:rollback", guarded("delete", "imports", (batchId, context) => rollbackImportBatch(db, batchId, context)));
  handle("imports:item-batches", () => listItemImportBatches(db));
  handle("imports:item-batch-delete", guarded("delete", "items", (batchId) => deleteItemImportBatch(db, batchId)));
  handle("items:delete-unused-imported", guarded("delete", "items", () => deleteUnusedImportedItems(db)));
  handle("master-data:export", guarded("export", "master_data_tools", (payload) => {
    const context = userContext([payload], { module: "master_data_tools" });
    return exportMasterData(db, payload, context, (entry) => auditLog(db, entry));
  }));
  handle("master-data:preview-update", guarded("import", "master_data_tools", (payload) => {
    return previewMasterDataUpdate(db, payload, userContext([payload], { module: "master_data_tools" }));
  }));
  handle("master-data:confirm-update", guarded("import", "master_data_tools", (payload) => {
    const context = userContext([payload], { module: "master_data_tools" });
    // Master-data import writes rows directly, so the bank-details rule is checked here.
    const touchesBank = masterImportTouchesBankDetails(payload?.masterKey, previewMasterDataUpdate(db, payload, context));
    if (touchesBank) {
      enforceBankDetailPermission(db, { company_id: payload?.company_id || null, table_name: payload?.masterKey, user_id: actorId() });
    }
    const result = confirmMasterDataUpdate(db, payload, context, (entry) => auditLog(db, entry));
    if (touchesBank) {
      auditLog(db, { company_id: payload?.company_id || null, action: "bank_details_changed", module: "security", table_name: payload?.masterKey, user_id: actorId(), new_value: JSON.stringify({ source: "master_data_import", batch: result?.batchId || null }) });
    }
    return result;
  }));
  handle("master-data:completeness", (_event, context) => {
    return getMasterDataCompleteness(db, userContext([context], { module: "master_data_tools" }));
  });
  handle("master-data:health", (_event, context) => {
    return getMasterDataToolsHealth(db, userContext([context], { module: "master_data_tools" }));
  });
  handle("documents:select-file", async (event) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: "Select Supporting Document",
      properties: ["openFile"],
      filters: [
        { name: "Supported Documents", extensions: ["pdf", "jpg", "jpeg", "png", "xlsx", "xls", "csv"] },
        { name: "PDF", extensions: ["pdf"] },
        { name: "Images", extensions: ["jpg", "jpeg", "png"] },
        { name: "Excel / CSV", extensions: ["xlsx", "xls", "csv"] }
      ]
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    selectedFiles.add(path.resolve(result.filePaths[0]));
    return { path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
  });
  handle("documents:upload", guarded("create", "documents", (payload) => uploadDocument(db, { ...payload, source_path: assertSelectedFile(payload?.source_path) }, runtimeDataRoot)));
  handle("documents:list", (_event, filters) => listDocuments(db, filters));
  handle("documents:view", async (event, id) => {
    const viewer = sessionUser(event);
    const doc = db.prepare("SELECT * FROM documents WHERE id = ? AND status = 'active' AND deleted_at IS NULL").get(id);
    if (!doc) throw new Error("Document not found");
    if (!fs.existsSync(doc.file_path)) throw new Error("Document file not found on disk");
    const openResult = await shell.openPath(doc.file_path);
    if (openResult) throw new Error(`Document could not be opened: ${openResult}`);
    auditLog(db, { company_id: doc.company_id, user_id: viewer.user_id, action: "document view", table_name: "documents", record_id: id });
    return { opened: true };
  });
  handle("documents:download", async (event, id) => {
    const viewer = sessionUser(event);
    const doc = db.prepare("SELECT * FROM documents WHERE id = ? AND status = 'active' AND deleted_at IS NULL").get(id);
    if (!doc) throw new Error("Document not found");
    if (!fs.existsSync(doc.file_path)) throw new Error("Document file not found on disk");
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath: savePath } = await dialog.showSaveDialog(win, {
      defaultPath: doc.original_file_name,
      filters: [{ name: "Documents", extensions: [doc.file_extension.replace(".", "")] }]
    });
    if (canceled || !savePath) return { canceled: true };
    fs.copyFileSync(doc.file_path, savePath);
    auditLog(db, { company_id: doc.company_id, user_id: viewer.user_id, action: "document download", table_name: "documents", record_id: id });
    return { canceled: false, savedPath: savePath };
  });
  handle("documents:delete", guarded("delete", "documents", (payload) => deleteDocument(db, payload.id, userContext([payload], { module: "documents" }))));
  handle("documents:replace", guarded("create", "documents", (payload) => replaceDocument(db, { ...payload, source_path: assertSelectedFile(payload?.source_path) }, runtimeDataRoot, userContext([payload], { module: "documents" }))));
  handle("audit:context", (event, payload = {}) => {
    const session = sessionUser(event);
    // Screens may record a few known context events only. They cannot pick the actor,
    // the audited table or an "old value", so a screen cannot fake a record's history.
    const action = String(payload.action || "screen_context");
    if (!UI_AUDIT_ACTIONS.has(action)) {
      throw new Error(`The audit event "${action.slice(0, 60)}" can only be written by the ERP itself, not by a screen.`);
    }
    return auditLog(db, {
      company_id: Number(payload.company_id || 0) || null,
      action: `ui:${action}`,
      module: String(payload.module || "ui").slice(0, 60),
      table_name: "ui_context",
      record_id: Number(payload.record_id || 0) || null,
      new_value: String(payload.new_value ?? "").slice(0, 500),
      user_id: session.user_id,
      user_role: session.role
    });
  });

  handle("print:html", async (event, preview) => {
    return withPrintWindow(event, preview, async (printWindow) => {
      return new Promise((resolve) => {
        printWindow.webContents.print(
          { printBackground: true, margins: { marginType: "printableArea" } },
          (success, failureReason) => resolve({ success, failureReason: failureReason || "" })
        );
      });
    });
  });

  handle("print:pdf", async (event, preview) => {
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
      title: "Save PDF",
      defaultPath: `${safePrintFileName(preview?.title)}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    return withPrintWindow(event, preview, async (printWindow) => {
      const pdf = await printWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: "A4",
        margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
      });
      fs.writeFileSync(result.filePath, pdf);
      return { success: true, filePath: result.filePath };
    });
  });

  handle("records:list", (_event, table, filters) => listRecords(db, table, filters));
  handle("records:create", guarded("create", "records", (table, payload) => createRecord(db, table, payload)));
  handle("records:update", guarded("edit", "records", (table, id, payload) => updateRecord(db, table, id, payload)));
  handle("records:delete", guarded("delete", "records", (table, id) => deleteRecord(db, table, id)));
  handle("purchase-orders:convert-to-work-order", guarded("create", "records", (id, payload) => convertPurchaseOrderToWorkOrder(db, id, payload)));
  handle("records:search", (_event, entityType, searchTerm, options) => {
    if (!SUPPORTED_ENTITY_TYPES.includes(entityType)) throw new Error(`Unsupported entity type: ${entityType}`);
    return searchEntities(db, entityType, searchTerm, options);
  });
  handle(
    "accounts:create-quick",
    sessionGuarded("account_mapping", "account_mapping", (payload, actor) => (
      createMappedLedgerAccount(db, payload, actor)
    ))
  );

  handle("backup:create", guarded("backup", "backup", () => createLiveBackup(db, runtimeDataRoot)));
  handle("backup:list", () => listBackups(runtimeDataRoot));
  handle("backup:restore", guarded("restore_backup", "backup", (fileName) => {
    const userId = actorId();
    db?.close();
    db = null;
    try {
      const restored = restoreBackup(fileName, runtimeDataRoot);
      db = initializeDatabase(runtimeDataRoot);
      auditLog(db, { action: "backup_restored", module: "backup", table_name: "system", user_id: userId, new_value: JSON.stringify(restored) });
      return restored;
    } catch (error) {
      if (["EBUSY", "EPERM"].includes(error.code)) {
        const pending = preparePendingRestore(fileName, runtimeDataRoot);
        app.relaunch();
        app.exit(0);
        return pending;
      }
      db = initializeDatabase(runtimeDataRoot);
      throw error;
    }
  }));

  handle("health:diagnostics", (_event, context) => {
    const healthContext = { ...context, dbName: DB_NAME };
    return {
      ...getHealthDiagnostics(db, runtimeDataRoot, healthContext),
      masterDataTools: getMasterDataToolsHealth(db, userContext([healthContext], { module: "master_data_tools" }))
    };
  });
  handle("health:checks", (_event, context) => {
    return runHealthChecks(db, runtimeDataRoot, { ...context, dbName: DB_NAME, verifyAuditChain });
  });
  handle("health:support-bundle", (_event, context) => {
    const healthContext = { ...context, dbName: DB_NAME };
    const diagnostics = getHealthDiagnostics(db, runtimeDataRoot, healthContext);
    const checks = runHealthChecks(db, runtimeDataRoot, healthContext);
    return createSupportBundle(db, runtimeDataRoot, diagnostics, checks, healthContext);
  });
  handle("health:error-console", (_event, context = {}) => {
    return errorConsoleState(db, runtimeDataRoot, { companyId: Number(context.company_id || 0) || null, verifyAuditChain });
  });
  handle("health:error-console-record", (_event, entry = {}) => {
    // Renderer-side failures (screen crashes, failed loads) join the same journal.
    return recordError(runtimeDataRoot, { source: "screen", channel: String(entry.screen || "renderer").slice(0, 80), message: entry.message, company_id: entry.company_id, user_id: actorId() });
  });
  handle("health:error-console-clear", guarded("system_reset", "health", () => {
    const result = clearErrorJournal(runtimeDataRoot);
    auditLog(db, { action: "error_console_cleared", table_name: "system", new_value: JSON.stringify(result) });
    return result;
  }));
  handle("alerts:get-settings", guarded("settings", "alerts", () => alerts.publicSettings(runtimeDataRoot)));
  handle("alerts:save-settings", guarded("settings", "alerts", (payload = {}) => alerts.saveSettings(db, runtimeDataRoot, payload)));
  handle("alerts:preview", guarded("settings", "alerts", (payload = {}) => alerts.buildDigest(db, Number(payload.company_id || 0))));
  handle("alerts:send-now", guarded("settings", "alerts", (payload = {}) => alerts.deliver(db, runtimeDataRoot, { companyId: Number(payload.company_id || 0) || null, test: Boolean(payload.test), reason: payload.test ? "test" : "manual", userId: actorId() })));
  handle("health:verification-console", () => {
    return getVerificationConsoleState(runtimeDataRoot);
  });
  handle("health:verification-snapshot", (_event, context) => {
    // The snapshot names the signed-in user, never one the screen supplies.
    const actor = ambientActor();
    const healthContext = { ...context, user_id: actor?.id || null, userId: undefined, user_name: actor?.id ? db.prepare("SELECT username FROM users WHERE id = ?").get(actor.id)?.username || "" : "", userName: undefined, role: actor?.role || "", dbName: DB_NAME };
    const checks = runHealthChecks(db, runtimeDataRoot, healthContext);
    return recordVerificationSnapshot(runtimeDataRoot, checks, healthContext);
  });
  handle("health:open-folder", async (_event, kind) => {
    const folders = {
      runtime: runtimeDataRoot,
      database: path.join(runtimeDataRoot, "database"),
      backups: path.join(runtimeDataRoot, "backups"),
      documents: path.join(runtimeDataRoot, "documents"),
      logs: path.join(runtimeDataRoot, "logs"),
      exports: path.join(runtimeDataRoot, "exports")
    };
    const folder = folders[kind] || folders.runtime;
    fs.mkdirSync(folder, { recursive: true });
    const failureReason = await shell.openPath(folder);
    if (failureReason) throw new Error(failureReason);
    return { success: true, folder, message: "Folder opened" };
  });

  handle("updates:status", () => getUpdateStatus());
  handle("updates:open-folder", async () => {
    const updateFolder = ensureUpdateFolder();
    const failureReason = await shell.openPath(updateFolder);
    if (failureReason) throw new Error(failureReason);
    return { success: true, updateFolder };
  });
  handle("updates:install", async (event, installerPath) => {
    const installer = enforcePermission(db, "settings", { module: "updates", table_name: "updates", user_id: sessionUser(event).user_id });
    const status = getUpdateStatus();
    const selectedInstaller = assertInstallerInsideUpdateFolder(installerPath || status.installerPath, status.updateFolder);
    auditLog(db, { action: "update_installer_launched", module: "updates", table_name: "system", user_id: installer.id, new_value: path.basename(selectedInstaller) });
    const failureReason = await shell.openPath(selectedInstaller);
    if (failureReason) throw new Error(failureReason);
    return { success: true, installerPath: selectedInstaller };
  });

  handle("environment:info", (_event, context) => {
    const companyId = Number(context?.company_id || 0);
    const healthContext = { ...context, dbName: DB_NAME };
    const diagnostics = getHealthDiagnostics(db, runtimeDataRoot, healthContext);
    const counts = dashboardCounts(db, companyId ? { company_id: companyId } : {});
    const backups = listBackups(runtimeDataRoot);
    const envConfig = readEnvironmentConfig();
    const hasOperationalData = counts.totalOrders > 0 || counts.vouchers > 0 || counts.invoices > 0;
    let lastReset = null;
    try {
      const resetRow = db.prepare("SELECT created_at, details FROM audit_log WHERE action = 'operational_reset' ORDER BY id DESC LIMIT 1").get();
      if (resetRow) {
        lastReset = { at: resetRow.created_at, details: resetRow.details };
      }
    } catch { /* table may not exist */ }
    return {
      environment: envConfig.environment || "Development",
      company: { id: companyId, name: context?.company_name || "" },
      database: {
        path: dbPath(runtimeDataRoot),
        exists: fs.existsSync(dbPath(runtimeDataRoot)),
        size: fs.existsSync(dbPath(runtimeDataRoot)) ? fs.statSync(dbPath(runtimeDataRoot)).size : 0
      },
      lastBackup: backups.length > 0 ? backups[0] : null,
      lastReset,
      lastVerificationProfile: envConfig.verificationProfile || "Development",
      operationalCounts: {
        totalOrders: counts.totalOrders,
        invoices: db.prepare("SELECT COUNT(*) count FROM invoices WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0").get(companyId)?.count || 0,
        procurements: db.prepare("SELECT COUNT(*) count FROM procurements WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0").get(companyId)?.count || 0,
        payments: db.prepare("SELECT COUNT(*) count FROM payments WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0").get(companyId)?.count || 0,
        vouchers: db.prepare("SELECT COUNT(*) count FROM vouchers WHERE company_id = ? AND is_deleted = 0").get(companyId)?.count || 0,
        receivables: db.prepare("SELECT COUNT(*) count FROM receivables WHERE company_id = ? AND is_deleted = 0").get(companyId)?.count || 0,
        payables: db.prepare("SELECT COUNT(*) count FROM procurements WHERE company_id = ? AND is_deleted = 0 AND posting_status = 'Posted'").get(companyId)?.count || 0
      },
      productionReadiness: hasOperationalData ? "Not Ready" : "Production Ready",
      app: diagnostics.app,
      paths: diagnostics.paths
    };
  });

  handle("environment:get-profiles", () => {
    return Object.entries(PROFILES).map(([key, profile]) => ({
      key,
      name: profile.name,
      description: profile.description
    }));
  });

  handle("environment:set-profile", guarded("system_reset", "environment", ({ profile } = {}) => {
    const config = readEnvironmentConfig();
    config.verificationProfile = profile;
    writeEnvironmentConfig(config);
    auditLog(db, { action: "environment_profile_changed", module: "environment", table_name: "system", user_id: actorId(), new_value: JSON.stringify({ profile }) });
    return { success: true, verificationProfile: profile };
  }));

  handle("environment:switch-type", guarded("system_reset", "environment", ({ environment } = {}) => {
    const config = readEnvironmentConfig();
    config.environment = environment;
    writeEnvironmentConfig(config);
    auditLog(db, { action: "environment_type_changed", module: "environment", table_name: "system", user_id: actorId(), new_value: JSON.stringify({ environment }) });
    return { success: true, environment };
  }));

  handle("backup:open-folder", () => {
    const backupDir = path.join(runtimeDataRoot, "backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    shell.openPath(backupDir);
    return { success: true, path: backupDir };
  });

  handle("deployment:readiness", (_event, payload = {}) => {
    return calculateReadinessScore(db, runtimeDataRoot, Number(payload?.company_id || 0) || null);
  });

  handle("deployment:certify", guarded("system_reset", "deployment", () => {
    return generateGoLiveCertificate(db, runtimeDataRoot, actorId());
  }));

  handle("deployment:certificate-history", () => {
    return getCertificateHistory(runtimeDataRoot);
  });

  handle("go-live:preconditions", (_event, payload = {}) => {
    const envConfig = readEnvironmentConfig();
    return checkGoLivePreconditions(db, runtimeDataRoot, envConfig?.environment || "development", Number(payload?.company_id || 0) || null);
  });

  handle("go-live:preview", () => {
    return previewGoLive(db, runtimeDataRoot);
  });

  handle("go-live:execute", guarded("system_reset", "go_live", (payload = {}) => {
    const envConfig = readEnvironmentConfig();
    return executeGoLiveReset(db, runtimeDataRoot, { userId: actorId(), companyId: payload.company_id, confirmText: payload.confirm_text, currentEnv: envConfig?.environment || "development" });
  }));

  handle("go-live:verify", guarded("system_reset", "go_live", ({ goLiveId } = {}) => {
    return verifyGoLiveProduction(db, runtimeDataRoot, actorId(), goLiveId);
  }));

  handle("go-live:complete", guarded("system_reset", "go_live", ({ goLiveId } = {}) => {
    return completeGoLive(db, runtimeDataRoot, actorId(), goLiveId);
  }));

  handle("go-live:rollback", guarded("restore_backup", "go_live", ({ goLiveId, reason } = {}) => {
    const userId = actorId();
    // A refusal comes back in the same shape as a failed rollback, so the screen shows it
    // the same way.
    try {
      assertGoLiveRollbackSafe(db, runtimeDataRoot, goLiveId);
    } catch (error) {
      // Only the guard's own refusals are answers; any other error is a fault and is thrown.
      if (error?.code !== ROLLBACK_REFUSED) throw error;
      // The id comes from the screen; only a short form of it is kept in the audit trail.
      auditLog(db, { action: "go_live_rollback_refused", module: "go_live", table_name: "system", user_id: userId, new_value: JSON.stringify({ goLiveId: String(goLiveId ?? "").slice(0, 64), reason: error.message.slice(0, 500) }) });
      return { rollbackResult: { success: false, reason: error.message }, reason };
    }
    const result = withDatabaseClosed(() => failGoLiveWithRollback(runtimeDataRoot, goLiveId, reason, null, userId));
    auditLog(db, { action: "go_live_rollback", module: "go_live", table_name: "system", user_id: userId, new_value: JSON.stringify({ goLiveId: String(goLiveId ?? "").slice(0, 64), reason: String(reason ?? "").slice(0, 500), success: result?.rollbackResult?.success }) });
    return result;
  }));

  handle("go-live:history", () => {
    return getGoLiveHistory(runtimeDataRoot);
  });

  handle("certificate:generate", guarded("system_reset", "go_live", () => generateCertificate(db, runtimeDataRoot)));

  handle("reset:preview", () => {
    return previewReset(db);
  });

  handle("reset:execute", guarded("system_reset", "operational_reset", (payload = {}) => {
    const result = executeReset(db, runtimeDataRoot, { userId: actorId(), companyId: payload.company_id, confirmText: payload.confirm_text });
    db.close();
    db = initializeDatabase(runtimeDataRoot);
    return result;
  }));

  handle("reset:analyze-dependencies", () => {
    return analyzeDependencies(db);
  });

  handle("reset:execute-enhanced", guarded("system_reset", "operational_reset", (payload = {}) => {
    const result = executeEnhancedReset(db, runtimeDataRoot, { userId: actorId(), companyId: payload.company_id, confirmText: payload.confirm_text });
    db.close();
    db = initializeDatabase(runtimeDataRoot);
    return result;
  }));

  handle("reset:rollback", guarded("restore_backup", "operational_reset", ({ backup } = {}) => {
    const userId = actorId();
    const result = withDatabaseClosed(() => rollbackReset(runtimeDataRoot, backup));
    auditLog(db, { action: "reset_rollback", module: "operational_reset", table_name: "system", user_id: userId, new_value: JSON.stringify(result) });
    return result;
  }));

  handle("crac:list", (_event, filters) => listCracRecords(db, filters));
  handle("crac:get", (_event, id) => getCracRecord(db, id));
  // CRAC services audit their own writes inside the write's transaction.
  const auditEntry = (entry) => auditLog(db, entry);
  handle("crac:create", guarded("create", "crac_records", (payload) => createCracRecord(db, { ...(payload || {}), created_by: actorId() }, auditEntry)));
  handle("crac:update", guarded("edit", "crac_records", (id, payload) => updateCracRecord(db, id, payload || {}, auditEntry)));
  handle("crac:delete", guarded("delete", "crac_records", (id) => deleteCracRecord(db, id, actorId(), auditEntry)));
  handle("crac:stats", (_event, filters) => getCracStats(db, Number(filters?.company_id || 0)));
  handle("crac:payment-readiness", (_event, filters) => getPaymentReadinessReport(db, filters));
  handle("crac:billed-without-crac", (_event, filters) => getOrdersBilledWithoutCrac(db, Number(filters?.company_id || 0)));
  handle("crac:payment-delayed", (_event, filters) => getPaymentDelayedOrders(db, Number(filters?.company_id || 0)));
  const closureOptions = { outstandingFor: receivableOutstandingForSettlement };
  handle("crac:closure-compute", (_event, orderId) => computeOrderClosure(db, orderId, closureOptions));
  handle("crac:closure-mark", guarded("edit", "supply_orders", (orderId) => markOrderOperationallyClosed(db, orderId, auditEntry, closureOptions)));
  handle("crac:closure-pending", (_event, filters) => getClosurePendingOrders(db, Number(filters?.company_id || 0)));

  handle("feedback:submit", (event, payload = {}) => {
    // The author is the signed-in user, never what the screen claims.
    const session = sessionUser(event);
    return submitFeedback(db, { ...payload, user_id: session.user_id, user_name: session.username });
  });
  handle("feedback:list", (_event, filters) => listFeedback(db, filters));
  handle("feedback:export", guarded("export", "feedback", (format) => exportFeedback(db, format)));
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  app.whenReady().then(() => {
    configureRuntimeStorage();
    applyPendingRestore(runtimeDataRoot);
    db = initializeDatabase(runtimeDataRoot);
    registerIpc();
    // Daily dues/stock alert: checked every 10 minutes, sends at most once a day.
    alertTimer = setInterval(() => {
      if (!db) return;
      alerts.runScheduled(db, runtimeDataRoot).catch((error) => recordError(runtimeDataRoot, { channel: "alerts:scheduled", message: error.message }));
    }, 10 * 60 * 1000);
    alertTimer.unref?.();
    installApplicationMenu();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    if (alertTimer) clearInterval(alertTimer);
    db?.close();
  });
}
