import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
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
  autoReserveOrderStock,
  bankStatementData,
  billingVoucherData,
  bulkImportRecords,
  closeFinancialYear,
  confirmDeliveryChallan,
  createBankStatementImport,
  createBusinessVoucher,
  createDeliveryChallan,
  createFinancialYear,
  enforcePermission,
  createManualVoucher,
  createOpeningBalance,
  createAdvanceReceipt,
  createLedgerAccount,
  createPartyOpeningBalance,
  createRecord,
  createDraftVoucherFromProposal,
  createReceiptAllocation,
  createSupplierAdvance,
  createSupplierPaymentAllocation,
  createWarehouseTransfer,
  dashboardCounts,
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
  updateVoucherProposal,
  updateFinancialYearStatus,
  updateBankImportStatus,
  updateRecord,
  updateGuidedVoucherStatus,
  APP_FOLDERS,
  DB_NAME,
  changeUserPassword,
  ensureAppFolders,
  setRuntimeRoot,
  sourceProjectRoot,
  voucherProposalData,
  previewImportRollback
} from "./database/init.js";
import { applyPendingRestore, createLiveBackup, listBackups, preparePendingRestore, restoreBackup } from "./services/backup.js";
import { getHealthDiagnostics, runHealthChecks } from "./services/healthService.js";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let db;
let runtimeDataRoot = "";

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

function firstPayload(args) {
  return args.find((arg) => arg && typeof arg === "object" && !Array.isArray(arg)) || {};
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

function guarded(permission, moduleName, handler) {
  return (_event, ...args) => {
    enforcePermission(db, permission, userContext(args, { module: moduleName, table_name: moduleName }));
    return handler(...args);
  };
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

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const appRoot = app.isPackaged ? app.getAppPath() : sourceProjectRoot();
    win.loadFile(path.join(appRoot, "dist", "index.html"));
  }

  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      safeMainLog("warn", `[renderer:${level}] ${message} (${sourceId}:${line})`);
    }
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    safeMainLog("error", `[renderer-load-failed] ${errorCode} ${errorDescription} ${validatedURL}`);
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    safeMainLog("error", `[renderer-process-gone] ${JSON.stringify(details)}`);
  });

  win.webContents.on("before-input-event", (event, input) => {
    const command = desktopShortcutCommand(input);
    if (command) {
      event.preventDefault();
      win.webContents.send("app:desktop-shortcut", command);
    }
  });
}

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

function registerIpc() {
  ipcMain.handle("auth:login", (_event, credentials) => {
    return authenticate(db, credentials.username, credentials.password);
  });
  ipcMain.handle("auth:change-password", (_event, payload) => {
    return changeUserPassword(db, payload);
  });

  ipcMain.handle("meta:masters", () => MASTER_TABLES);
  ipcMain.handle("meta:transactions", () => TRANSACTION_TABLES);
  ipcMain.handle("master-data:definitions", () => getMasterDataToolDefinitions());
  ipcMain.handle("dashboard:counts", (_event, filters) => dashboardCounts(db, filters));
  ipcMain.handle("references:list", (_event, filters) => referenceData(db, filters));
  ipcMain.handle("profitability:list", (_event, filters) => orderProfitability(db, filters));
  ipcMain.handle("accounting:data", (_event, filters) => accountingData(db, filters));
  ipcMain.handle("bank:data", (_event, filters) => bankStatementData(db, filters));
  ipcMain.handle("bank:preview-import", (_event, payload) => previewBankStatementImport(db, payload));
  ipcMain.handle("bank:create-import", guarded("import", "bank_statement_imports", (payload) => createBankStatementImport(db, payload)));
  ipcMain.handle("bank:status", guarded("approve", "bank_statement_imports", (importId, status, userId, remarks) => updateBankImportStatus(db, importId, status, userId, remarks)));
  ipcMain.handle("bank:manual-match", guarded("edit", "bank_statement_entries", (entryId, payload) => manualBankEntryMatch(db, entryId, payload)));
  ipcMain.handle("bank:post-approved", guarded("post", "bank_statement_imports", (importId, userId) => postApprovedBankImport(db, importId, userId)));
  ipcMain.handle("voucher-proposals:data", (_event, filters) => voucherProposalData(db, filters));
  ipcMain.handle("voucher-proposals:generate", guarded("approve", "voucher_proposals", (importId, userId) => generateVoucherProposalsForImport(db, importId, userId)));
  ipcMain.handle("voucher-proposals:update", guarded("edit", "voucher_proposals", (proposalId, payload) => updateVoucherProposal(db, proposalId, payload)));
  ipcMain.handle("voucher-proposals:approve", guarded("approve", "voucher_proposals", (proposalId, userId, remarks) => approveVoucherProposal(db, proposalId, userId, remarks)));
  ipcMain.handle("voucher-proposals:reject", guarded("approve", "voucher_proposals", (proposalId, userId, reason) => rejectVoucherProposal(db, proposalId, userId, reason)));
  ipcMain.handle("voucher-proposals:create-draft", guarded("create", "voucher_proposals", (proposalId, userId) => createDraftVoucherFromProposal(db, proposalId, userId)));
  ipcMain.handle("voucher-proposals:post-draft", guarded("post", "voucher_proposals", (proposalId, userId) => postDraftVoucherFromProposal(db, proposalId, userId)));
  ipcMain.handle("billing:data", (_event, filters) => billingVoucherData(db, filters));
  ipcMain.handle("billing:save", guarded("create", "billing", (payload) => saveBillingVoucher(db, payload)));
  ipcMain.handle("inventory:data", (_event, filters) => inventoryData(db, filters));
  ipcMain.handle("inventory:post-inward", guarded("post", "stock_inwards", (id) => postStockInward(db, id)));
  ipcMain.handle("inventory:post-outward", guarded("post", "stock_outwards", (id) => postStockOutward(db, id)));
  ipcMain.handle("inventory:post-adjustment", guarded("post", "stock_adjustments", (id) => postStockAdjustment(db, id)));
  ipcMain.handle("inventory:post-return", guarded("post", "stock_returns", (id) => postStockReturn(db, id)));
  ipcMain.handle("inventory:approve-adjustment", guarded("approve", "stock_adjustments", (id, userId, remarks) => approveStockAdjustment(db, id, userId, remarks)));
  ipcMain.handle("inventory:auto-reserve-order", guarded("edit", "stock_reservations", (orderId) => autoReserveOrderStock(db, orderId)));
  ipcMain.handle("inventory:create-delivery-challan", guarded("create", "delivery_challans", (payload) => createDeliveryChallan(db, payload)));
  ipcMain.handle("inventory:confirm-delivery-challan", guarded("post", "delivery_challans", (id, userId) => confirmDeliveryChallan(db, id, userId)));
  ipcMain.handle("inventory:create-transfer", guarded("create", "warehouse_transfers", (payload) => createWarehouseTransfer(db, payload)));
  ipcMain.handle("inventory:post-transfer", guarded("post", "warehouse_transfers", (id, userId) => postWarehouseTransfer(db, id, userId)));
  ipcMain.handle("allocations:receipt-create", guarded("edit", "payment_allocations", (payload) => createReceiptAllocation(db, payload)));
  ipcMain.handle("allocations:receipt-unallocate", guarded("reverse", "payment_allocations", (allocationId, reason) => unallocateReceiptAllocation(db, allocationId, reason)));
  ipcMain.handle("allocations:receipt-reallocate", guarded("edit", "payment_allocations", (allocationId, payload) => reallocateReceiptAllocation(db, allocationId, payload)));
  ipcMain.handle("allocations:supplier-create", guarded("edit", "supplier_payment_allocations", (payload) => createSupplierPaymentAllocation(db, payload)));
  ipcMain.handle("allocations:supplier-unallocate", guarded("reverse", "supplier_payment_allocations", (allocationId, reason) => unallocateSupplierPaymentAllocation(db, allocationId, reason)));
  ipcMain.handle("allocations:supplier-reallocate", guarded("edit", "supplier_payment_allocations", (allocationId, payload) => reallocateSupplierPaymentAllocation(db, allocationId, payload)));
  ipcMain.handle("advances:receipt-create", guarded("create", "advance_receipts", (payload) => createAdvanceReceipt(db, payload)));
  ipcMain.handle("advances:supplier-create", guarded("create", "supplier_advances", (payload) => createSupplierAdvance(db, payload)));
  ipcMain.handle("advances:receipt-adjust", guarded("edit", "advance_receipts", (payload) => adjustAdvanceReceipt(db, payload)));
  ipcMain.handle("advances:supplier-adjust", guarded("edit", "supplier_advances", (payload) => adjustSupplierAdvance(db, payload)));
  ipcMain.handle("advances:adjustment-reverse", guarded("reverse", "advance_adjustments", (adjustmentId, reason, userId) => reverseAdvanceAdjustment(db, adjustmentId, reason, userId)));
  ipcMain.handle("credit-terms:save", guarded("settings", "credit_terms", (payload) => saveCreditTerm(db, payload)));
  ipcMain.handle("party-opening:create", guarded("opening_balance", "party_opening_balances", (payload) => createPartyOpeningBalance(db, payload)));
  ipcMain.handle("vouchers:create", guarded("post", "vouchers", (payload) => createManualVoucher(db, payload)));
  ipcMain.handle("vouchers:create-business", guarded("create", "guided_vouchers", (payload) => createBusinessVoucher(db, payload)));
  ipcMain.handle("vouchers:guided-status", guarded("approve", "guided_vouchers", (id, action, userId, remarks) => updateGuidedVoucherStatus(db, id, action, userId, remarks)));
  ipcMain.handle("vouchers:guided-post", guarded("post", "guided_vouchers", (id, userId) => postGuidedVoucher(db, id, userId)));
  ipcMain.handle("vouchers:reverse", guarded("reverse", "vouchers", (voucherId, reason) => reverseVoucher(db, voucherId, reason)));
  ipcMain.handle("posting:post", guarded("post", "posting", (moduleName, recordId) => postBusinessTransaction(db, moduleName, recordId)));
  ipcMain.handle("approval:approve", guarded("approve", "approval_queue", (moduleName, recordId, userId, remarks) => approveTransaction(db, moduleName, recordId, userId, remarks)));
  ipcMain.handle("financial-years:create", guarded("settings", "financial_years", (payload) => createFinancialYear(db, payload)));
  ipcMain.handle("financial-years:status", guarded("financial_year_close", "financial_years", (id, status, userId) => updateFinancialYearStatus(db, id, status, userId)));
  ipcMain.handle("opening-balances:create", guarded("opening_balance", "opening_balances", (payload) => createOpeningBalance(db, payload)));
  ipcMain.handle("accounting:drilldown", (_event, payload) => drilldownData(db, payload));
  ipcMain.handle("financial-years:close", guarded("financial_year_close", "financial_years", (payload) => closeFinancialYear(db, payload)));
  ipcMain.handle("imports:parse-file", (_event, filePath) => parseImportFile(filePath));
  ipcMain.handle("imports:parse-buffer", (_event, fileName, bytes) => parseImportBuffer(fileName, bytes));
  ipcMain.handle("imports:select-file", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select import file",
      properties: ["openFile"],
      filters: [{ name: "Excel or CSV", extensions: ["xlsx", "xls", "csv"] }]
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    return { path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
  });
  ipcMain.handle("tally:select-xml-file", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select Tally Prime XML export",
      properties: ["openFile"],
      filters: [{ name: "Tally XML", extensions: ["xml"] }]
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    return { path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
  });
  ipcMain.handle("tally:select-migration-file", async (_event, type) => {
    const result = await dialog.showOpenDialog({
      title: "Select Tally migration or reference file",
      properties: ["openFile"],
      filters: [{ name: "Tally XML, Excel or CSV", extensions: ["xml", "xlsx", "xls", "csv"] }]
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    return { path: result.filePaths[0], name: path.basename(result.filePaths[0]), type: type || "" };
  });
  ipcMain.handle("tally:preview-stock-xml", guarded("import", "tally_xml_import", (payload) => previewTallyStockXml(typeof payload === "string" ? payload : payload?.filePath)));
  ipcMain.handle("tally:preview-master-migration", guarded("import", "tally_migration_assistant", (payload) => previewTallyMasterMigration(db, payload?.files || [], userContext([payload], { module: "tally_migration_assistant" }))));
  ipcMain.handle("imports:confirm", guarded("import", "imports", (table, rows, context) => bulkImportRecords(db, table, rows, context)));
  ipcMain.handle("imports:batches", (_event, filters) => listImportBatches(db, filters));
  ipcMain.handle("imports:rollback-preview", (_event, batchId) => previewImportRollback(db, batchId));
  ipcMain.handle("imports:rollback", guarded("delete", "imports", (batchId, context) => rollbackImportBatch(db, batchId, context)));
  ipcMain.handle("imports:item-batches", () => listItemImportBatches(db));
  ipcMain.handle("imports:item-batch-delete", guarded("delete", "items", (batchId) => deleteItemImportBatch(db, batchId)));
  ipcMain.handle("items:delete-unused-imported", guarded("delete", "items", () => deleteUnusedImportedItems(db)));
  ipcMain.handle("master-data:export", guarded("export", "master_data_tools", (payload) => {
    const context = userContext([payload], { module: "master_data_tools" });
    return exportMasterData(db, payload, context, (entry) => auditLog(db, entry));
  }));
  ipcMain.handle("master-data:preview-update", guarded("import", "master_data_tools", (payload) => {
    return previewMasterDataUpdate(db, payload, userContext([payload], { module: "master_data_tools" }));
  }));
  ipcMain.handle("master-data:confirm-update", guarded("import", "master_data_tools", (payload) => {
    const context = userContext([payload], { module: "master_data_tools" });
    return confirmMasterDataUpdate(db, payload, context, (entry) => auditLog(db, entry));
  }));
  ipcMain.handle("master-data:completeness", (_event, context) => {
    return getMasterDataCompleteness(db, userContext([context], { module: "master_data_tools" }));
  });
  ipcMain.handle("master-data:health", (_event, context) => {
    return getMasterDataToolsHealth(db, userContext([context], { module: "master_data_tools" }));
  });
  ipcMain.handle("documents:upload", guarded("create", "documents", (payload) => uploadDocument(db, payload, runtimeDataRoot)));
  ipcMain.handle("documents:list", (_event, filters) => listDocuments(db, filters));
  ipcMain.handle("audit:context", (_event, payload) => auditLog(db, payload));

  ipcMain.handle("print:html", async (event, preview) => {
    return withPrintWindow(event, preview, async (printWindow) => {
      return new Promise((resolve) => {
        printWindow.webContents.print(
          { printBackground: true, margins: { marginType: "printableArea" } },
          (success, failureReason) => resolve({ success, failureReason: failureReason || "" })
        );
      });
    });
  });

  ipcMain.handle("print:pdf", async (event, preview) => {
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

  ipcMain.handle("records:list", (_event, table, filters) => listRecords(db, table, filters));
  ipcMain.handle("records:create", guarded("create", "records", (table, payload) => createRecord(db, table, payload)));
  ipcMain.handle("records:update", guarded("edit", "records", (table, id, payload) => updateRecord(db, table, id, payload)));
  ipcMain.handle("records:delete", guarded("delete", "records", (table, id) => deleteRecord(db, table, id)));
  ipcMain.handle("accounts:create-quick", guarded("create", "accounts", (payload) => createLedgerAccount(db, payload)));

  ipcMain.handle("backup:create", guarded("backup", "backup", () => createLiveBackup(db, runtimeDataRoot)));
  ipcMain.handle("backup:list", () => listBackups(runtimeDataRoot));
  ipcMain.handle("backup:restore", guarded("restore_backup", "backup", (fileName) => {
    db?.close();
    db = null;
    try {
      const restored = restoreBackup(fileName, runtimeDataRoot);
      db = initializeDatabase(runtimeDataRoot);
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

  ipcMain.handle("health:diagnostics", (_event, context) => {
    const healthContext = { ...context, dbName: DB_NAME };
    return {
      ...getHealthDiagnostics(db, runtimeDataRoot, healthContext),
      masterDataTools: getMasterDataToolsHealth(db, userContext([healthContext], { module: "master_data_tools" }))
    };
  });
  ipcMain.handle("health:checks", (_event, context) => {
    return runHealthChecks(db, runtimeDataRoot, { ...context, dbName: DB_NAME });
  });
  ipcMain.handle("health:support-bundle", (_event, context) => {
    const healthContext = { ...context, dbName: DB_NAME };
    const diagnostics = getHealthDiagnostics(db, runtimeDataRoot, healthContext);
    const checks = runHealthChecks(db, runtimeDataRoot, healthContext);
    return createSupportBundle(db, runtimeDataRoot, diagnostics, checks, healthContext);
  });
  ipcMain.handle("health:verification-console", () => {
    return getVerificationConsoleState(runtimeDataRoot);
  });
  ipcMain.handle("health:verification-snapshot", (_event, context) => {
    const healthContext = { ...context, dbName: DB_NAME };
    const checks = runHealthChecks(db, runtimeDataRoot, healthContext);
    return recordVerificationSnapshot(runtimeDataRoot, checks, healthContext);
  });
  ipcMain.handle("health:open-folder", async (_event, kind) => {
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

  ipcMain.handle("updates:status", () => getUpdateStatus());
  ipcMain.handle("updates:open-folder", async () => {
    const updateFolder = ensureUpdateFolder();
    const failureReason = await shell.openPath(updateFolder);
    if (failureReason) throw new Error(failureReason);
    return { success: true, updateFolder };
  });
  ipcMain.handle("updates:install", async (_event, installerPath) => {
    const status = getUpdateStatus();
    const selectedInstaller = assertInstallerInsideUpdateFolder(installerPath || status.installerPath, status.updateFolder);
    const failureReason = await shell.openPath(selectedInstaller);
    if (failureReason) throw new Error(failureReason);
    return { success: true, installerPath: selectedInstaller };
  });

  ipcMain.handle("crac:list", (_event, filters) => listCracRecords(db, filters));
  ipcMain.handle("crac:get", (_event, id) => getCracRecord(db, id));
  ipcMain.handle("crac:create", guarded("create", "crac_records", (payload) => createCracRecord(db, payload)));
  ipcMain.handle("crac:update", guarded("edit", "crac_records", (id, payload) => updateCracRecord(db, id, payload)));
  ipcMain.handle("crac:delete", guarded("delete", "crac_records", (id, deletedBy) => deleteCracRecord(db, id, deletedBy)));
  ipcMain.handle("crac:stats", (_event, filters) => getCracStats(db, Number(filters?.company_id || 0)));
  ipcMain.handle("crac:payment-readiness", (_event, filters) => getPaymentReadinessReport(db, filters));
  ipcMain.handle("crac:billed-without-crac", (_event, filters) => getOrdersBilledWithoutCrac(db, Number(filters?.company_id || 0)));
  ipcMain.handle("crac:payment-delayed", (_event, filters) => getPaymentDelayedOrders(db, Number(filters?.company_id || 0)));
  ipcMain.handle("crac:closure-compute", (_event, orderId) => computeOrderClosure(db, orderId));
  ipcMain.handle("crac:closure-mark", guarded("edit", "supply_orders", (orderId) => markOrderOperationallyClosed(db, orderId)));
  ipcMain.handle("crac:closure-pending", (_event, filters) => getClosurePendingOrders(db, Number(filters?.company_id || 0)));
}

app.whenReady().then(() => {
  configureRuntimeStorage();
  applyPendingRestore(runtimeDataRoot);
  db = initializeDatabase(runtimeDataRoot);
  registerIpc();
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
  db?.close();
});
