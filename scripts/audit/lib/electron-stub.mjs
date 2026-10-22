// Minimal stand-in for the "electron" module so src/main/main.js can be imported
// under plain Node and its real IPC handlers exercised in tests.
export const handlers = new Map();
const noop = () => {};
export const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn), on: noop };
let readyResolve;
const ready = new Promise((resolve) => { readyResolve = resolve; });
export const app = {
  isPackaged: false,
  disableHardwareAcceleration: noop,
  commandLine: { appendSwitch: noop },
  setPath: noop,
  getPath: () => process.env.GII_GEM_ERP_DATA_ROOT,
  getVersion: () => "0.0.0-test",
  getAppPath: () => process.cwd(),
  requestSingleInstanceLock: () => true,
  on: noop,
  quit: noop,
  exit: noop,
  relaunch: noop,
  whenReady: () => ready,
  __fireReady: () => readyResolve()
};
export class BrowserWindow {
  constructor() { this.webContents = { id: 9999, on: noop, send: noop, setWindowOpenHandler: noop }; }
  static getAllWindows() { return []; }
  static getFocusedWindow() { return null; }
  static fromWebContents() { return null; }
  loadURL() {} loadFile() {} on() {}
}
export const dialog = { showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showSaveDialog: async () => ({ canceled: true }) };
export const Menu = { setApplicationMenu: noop, buildFromTemplate: () => ({}) };
export const shell = { openPath: async () => "" };
export const safeStorage = { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(`enc:${value}`), decryptString: (buffer) => buffer.toString().slice(4) };
export default { ipcMain, app, BrowserWindow, dialog, Menu, shell, safeStorage };
