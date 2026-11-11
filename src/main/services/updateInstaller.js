// Manual updater: checks an installer in the update folder and stages a hashed copy of it in
// the app's data folder. Kept out of main.js so it can be read and tested on its own; the
// updates:install handler in main.js decides when this runs and writes the audit rows.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline as streamPipeline } from "node:stream/promises";

// Errors the user can act on carry `guided`, so the updater passes them through unchanged
// and maps everything else to one plain message.
export function guidedError(message) {
  return Object.assign(new Error(message), { guided: true });
}

export function assertInstallerInsideUpdateFolder(installerPath, updateFolder) {
  if (installerPath != null && typeof installerPath !== "string") throw guidedError("Choose the installer from the update folder and try again.");
  const resolvedInstaller = path.resolve(installerPath || "");
  // A ":" in the name would name a hidden Windows stream, not the file shown in the folder.
  if (path.basename(resolvedInstaller).includes(":")) {
    throw guidedError("The installer name cannot contain \":\". Use the GII-GeM-ERP-Setup-<version>-x64.exe file as it is.");
  }
  if (!/\.exe$/i.test(resolvedInstaller)) {
    throw guidedError("Only Windows EXE update installers can be launched.");
  }
  if (!fs.existsSync(resolvedInstaller)) {
    throw guidedError("Update installer file was not found. Put the installer in the update folder and try again.");
  }
  // Links are followed before the check, and the installer must sit directly in the update
  // folder (not in a sub-folder), so a link or folder cannot point the launch elsewhere.
  let realFolder;
  let realInstaller;
  try {
    realFolder = fs.realpathSync(path.resolve(updateFolder));
    realInstaller = fs.realpathSync(resolvedInstaller);
  } catch {
    throw guidedError("The update folder or installer could not be opened. Use Open Update Folder, put the installer there and try again.");
  }
  let isFile = false;
  try { isFile = fs.lstatSync(realInstaller).isFile(); } catch { /* vanished meanwhile: refused below */ }
  if (path.dirname(realInstaller) !== realFolder || !isFile) {
    throw guidedError("Selected installer is not directly inside the update folder. Copy the installer file itself into the update folder (not a shortcut or sub-folder) and try again.");
  }
  return realInstaller;
}

// The installer is copied into the app's own data folder in one read, hashed as it is copied,
// and the copy is what runs, so a file changed in the update folder afterwards cannot be
// launched in its place. Reading in chunks keeps the app responsive on a large file.
const MAX_INSTALLER_BYTES = 1024 * 1024 * 1024;
// Open without following a link and without waiting on a pipe. Both flags are 0 on Windows,
// where the lstat/handle comparison below does the same job.
const INSTALLER_OPEN_FLAGS = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0);
export function stagingFolderPath(dataRoot) {
  return path.join(dataRoot, "update-staging");
}
// Called at start-up, before any install can run: an installer copy from an earlier session
// is not kept. Removing a planted link removes the link only.
export function clearInstallerStaging(dataRoot) {
  try { fs.rmSync(stagingFolderPath(dataRoot), { recursive: true, force: true }); } catch { /* best effort */ }
}
// The staging folder must be a real folder of the app's own, never a link to somewhere else.
async function ensureStagingFolder(dataRoot) {
  const stagingFolder = stagingFolderPath(dataRoot);
  const existing = await fs.promises.lstat(stagingFolder).catch(() => null);
  if (existing && !existing.isDirectory()) await fs.promises.rm(stagingFolder, { force: true });
  await fs.promises.mkdir(stagingFolder, { recursive: true });
  if (!(await fs.promises.lstat(stagingFolder)).isDirectory()) {
    throw guidedError("The app's update-staging folder is not a normal folder, so the update was not prepared. Restart the ERP and try again.");
  }
  // Only one install runs at a time, so copies left by earlier failed attempts can go.
  for (const name of await fs.promises.readdir(stagingFolder)) {
    await fs.promises.rm(path.join(stagingFolder, name), { recursive: true, force: true }).catch(() => {});
  }
  // Each install gets a new, empty folder of its own, so nothing planted beforehand is reused,
  // and it must really be inside the staging folder (not a link swapped in meanwhile).
  const dir = await fs.promises.mkdtemp(path.join(stagingFolder, "install-"));
  const realDir = await fs.promises.realpath(dir);
  if (path.dirname(realDir) !== (await fs.promises.realpath(stagingFolder)) || !(await fs.promises.lstat(dir)).isDirectory()) {
    throw guidedError("The app's update-staging folder changed while the update was being prepared, so it was not started. Restart the ERP and try again.");
  }
  return dir;
}
// The name as the renderer sent it, cut to a file-name length for the audit log.
export function shortInstallerName(installerPath) {
  return path.basename(typeof installerPath === "string" ? installerPath : "").slice(0, 255);
}
// The staged copy is hashed again just before it runs, so the hash in the audit log is the
// hash of what was launched.
export async function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  await streamPipeline(fs.createReadStream(filePath), hash);
  return hash.digest("hex");
}
function sameFile(a, b) {
  return a.dev === b.dev && a.ino === b.ino;
}
export async function stageInstaller(installerPath, updateFolder, dataRoot) {
  let handle = null;
  let stagedPath = "";
  let stagingDir = "";
  try {
    stagingDir = await ensureStagingFolder(dataRoot);
    // Checked, then opened without following links; the path is checked again after the open
    // and must still name the very file that is open. Everything after reads the open file,
    // so a file swapped into the update folder from here on is not what gets copied.
    const checked = assertInstallerInsideUpdateFolder(installerPath, updateFolder);
    try {
      handle = await fs.promises.open(checked, INSTALLER_OPEN_FLAGS);
    } catch (error) {
      if (error.code === "ELOOP" || error.code === "EISDIR") throw guidedError("The installer changed or is linked to another file, so it was not started. Copy the installer file itself into the update folder and try again.");
      throw error;
    }
    const stats = await handle.stat({ bigint: true });
    const recheck = assertInstallerInsideUpdateFolder(installerPath, updateFolder);
    const pathStats = fs.lstatSync(recheck, { bigint: true });
    if (recheck !== checked || !stats.isFile() || !pathStats.isFile() || !sameFile(stats, pathStats) || stats.nlink !== 1n) {
      throw guidedError("The installer changed or is linked to another file, so it was not started. Copy the installer file itself into the update folder and try again.");
    }
    const size = Number(stats.size);
    if (size > MAX_INSTALLER_BYTES) {
      throw guidedError("This installer is larger than any GII GeM ERP installer (1 GB at most), so it was not started. Download the installer again and put it in the update folder.");
    }
    try {
      const space = await fs.promises.statfs(stagingDir);
      if (Number(space.bavail) * Number(space.bsize) < size + 64 * 1024 * 1024) {
        throw guidedError("There is not enough free disk space next to the books to prepare the update. Free some space, then try again.");
      }
    } catch (error) { if (error.guided) throw error; /* free space unknown: the copy itself still stops on a full disk */ }
    stagedPath = path.join(stagingDir, path.basename(checked));
    const hash = crypto.createHash("sha256");
    let copied = 0;
    const reader = handle.createReadStream({ autoClose: false, start: 0 });
    reader.on("data", (chunk) => {
      copied += chunk.length;
      if (copied > MAX_INSTALLER_BYTES) reader.destroy(guidedError("The installer grew while it was being copied, so it was not started. Try again."));
      hash.update(chunk);
    });
    await streamPipeline(reader, fs.createWriteStream(stagedPath, { flags: "wx" }));
    if (copied !== size) throw guidedError("The installer changed size while it was being copied, so it was not started. Wait for any download to finish, then try again.");
    // Keep Windows' "downloaded from the internet" mark, so the usual warning still shows.
    if (process.platform === "win32") {
      try {
        const mark = fs.readFileSync(`${checked}:Zone.Identifier`);
        if (mark.length <= 64 * 1024) fs.writeFileSync(`${stagedPath}:Zone.Identifier`, mark);
      } catch (error) {
        if (error.code !== "ENOENT") console.warn(`[updates] The installer's download mark could not be copied (${error.code || error.message}).`);
      }
    }
    return { stagedPath, sha256: hash.digest("hex") };
  } catch (error) {
    if (stagingDir) { try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch { /* best effort */ } }
    if (error.guided) throw error;
    console.error("[updates] Preparing the installer failed:", error);
    // A full disk is always the data-folder side: only the copy writes. Otherwise the file
    // named in the error says which side failed.
    const diskFull = error.code === "ENOSPC" || error.code === "EDQUOT";
    const inStaging = diskFull || (typeof error.path === "string" && path.resolve(error.path).startsWith(stagingFolderPath(dataRoot)));
    const advice = diskFull
      ? "The disk that holds the ERP's data is full. Free some space, then try again."
      : error.code === "EACCES" || error.code === "EPERM" || error.code === "EBUSY"
        ? `The ${inStaging ? "ERP's data folder" : "installer in the update folder"} is locked or not readable. Close any program using it, then try again.`
        : `Check free disk space and ${inStaging ? "the ERP's data folder" : "the update folder"}, then try again.`;
    throw Object.assign(guidedError(`The update could not be prepared (${error.code || "unexpected error"}). ${advice} Nothing was installed.`), {
      detail: { code: error.code || null, syscall: error.syscall || null, file: typeof error.path === "string" ? path.basename(error.path) : null, side: inStaging ? "data-folder" : "update-folder" }
    });
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}
