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
  // The installer itself must not be a link to another file, even one in the same folder.
  const sameName = (x, y) => (process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y);
  if (!sameName(path.basename(realInstaller), path.basename(resolvedInstaller))) isFile = false;
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
  removeStagingTree(stagingFolderPath(dataRoot));
  sweepMovedStaging(dataRoot);
}
// Removes only what the updater itself makes: a staging folder, its install-* folders and
// the installer copies inside them (a copy's download mark goes with it). Every entry is
// checked with lstat and removed with unlink/rmdir, never a recursive delete. A link at the
// top is only unlinked; below the top it is left alone. The folder is checked again after it
// is listed and before each removal, so a folder swapped for a link meanwhile is not cleared
// through. Anything else is left, with one warning per folder.
const INSTALLER_COPY_NAME = /^GII-GeM-ERP-(?:Setup|Portable)-[^\\/]+\.exe$/i;
export function removeStagingTree(folder, depth = 0) {
  let stats;
  try { stats = fs.lstatSync(folder, { bigint: true }); } catch { return; }
  if (!stats.isDirectory()) {
    if (depth === 0) { try { fs.unlinkSync(folder); } catch { /* best effort */ } }
    return;
  }
  const unchanged = () => {
    try { return sameFile(fs.lstatSync(folder, { bigint: true }), stats); } catch { return false; }
  };
  let names = [];
  try { names = fs.readdirSync(folder); } catch { /* removed below if empty */ }
  if (!unchanged()) return;
  let leftOver = 0;
  for (const name of names) {
    const entry = path.join(folder, name);
    let entryStats;
    try { entryStats = fs.lstatSync(entry); } catch { continue; }
    if (entryStats.isSymbolicLink() && depth === 0) {
      if (unchanged()) { try { fs.unlinkSync(entry); } catch { /* best effort */ } }
    } else if (entryStats.isDirectory() && !entryStats.isSymbolicLink() && depth === 0 && name.startsWith("install-")) {
      removeStagingTree(entry, 1);
    } else if (entryStats.isFile() && depth === 1 && INSTALLER_COPY_NAME.test(name)) {
      if (unchanged()) { try { fs.unlinkSync(entry); } catch { /* best effort */ } }
    } else {
      leftOver += 1;
    }
  }
  if (leftOver) console.warn(`[updates] Left ${leftOver} unexpected item(s) in ${path.basename(folder)}.`);
  if (unchanged()) { try { fs.rmdirSync(folder); } catch { /* not empty or in use: left as is */ } }
}
// Removes one staged copy that the updater made, only if it is still that very file, and
// then its folder if empty. Nothing is listed, so nothing swapped in is cleared through.
export function removeStagedCopy(staged) {
  try {
    const now = fs.lstatSync(staged.stagedPath, { bigint: true });
    if (now.isFile() && sameFile(now, staged.stagedFile)) fs.unlinkSync(staged.stagedPath);
  } catch { /* already gone */ }
  try { fs.rmdirSync(path.dirname(staged.stagedPath)); } catch { /* not empty or gone */ }
}
// Staging folders moved aside by earlier installs whose removal failed (rm removes a link
// itself, never what it points to).
function sweepMovedStaging(dataRoot) {
  try {
    for (const name of fs.readdirSync(dataRoot)) {
      if (/^update-staging\.old-[0-9a-f]{16}$/.test(name)) {
        removeStagingTree(path.join(dataRoot, name));
      }
    }
  } catch { /* best effort */ }
}
// The staging folder's real path, compared without case on Windows.
function isInsideStaging(filePath, dataRoot) {
  const norm = (value) => (process.platform === "win32" ? value.toLowerCase() : value);
  let real = stagingFolderPath(dataRoot);
  // The native call resolves mapped and subst drives the same way fs.promises.realpath does.
  try { real = path.join(fs.realpathSync.native(dataRoot), "update-staging"); } catch { /* use the plain path */ }
  const target = norm(path.resolve(filePath));
  return [real, stagingFolderPath(dataRoot)].some((folder) => target === norm(folder) || target.startsWith(norm(folder) + path.sep));
}
// The staging folder must be a real folder of the app's own, never a link to somewhere else.
// Whatever is there is first renamed away under a random name: a rename moves a link itself,
// never what it points to, so clearing it cannot delete through a link swapped in meanwhile.
async function ensureStagingFolder(dataRoot) {
  // Where the staging folder really is when nothing is linked: inside the real data folder.
  const expected = path.join(await fs.promises.realpath(dataRoot), "update-staging");
  const changed = () => guidedError("The app's update-staging folder changed while the update was being prepared, so it was not started. Restart the ERP and try again.");
  sweepMovedStaging(path.dirname(expected));
  const old = `${expected}.old-${crypto.randomBytes(8).toString("hex")}`;
  let inPlace = false;
  try {
    await fs.promises.rename(expected, old);
  } catch (error) {
    if (error.code === "ENOENT") { /* nothing there yet */ }
    // Windows cannot rename a folder while a file in it is open (antivirus, a slow installer).
    // A real folder, not a link, is then used where it is; the check after mkdtemp still holds.
    else if (["EPERM", "EACCES", "EBUSY"].includes(error.code) && ownStagingFolder(await fs.promises.lstat(expected))) inPlace = true;
    else throw error;
  }
  const moved = await fs.promises.lstat(old).catch(() => null);
  if (moved) {
    // A link is only unlinked; a real folder holds copies from earlier attempts and can go.
    if (moved.isDirectory()) removeStagingTree(old);
    else await fs.promises.unlink(old).catch(() => {});
  }
  if (inPlace) {
    // Clear what can be cleared; a copy still held open stays until it is released.
    for (const name of await fs.promises.readdir(expected).catch(() => [])) {
      if (name.startsWith("install-")) removeStagingTree(path.join(expected, name), 1);
    }
  }
  // Not recursive: if something else created the folder in the meantime, this fails.
  if (!inPlace) {
    try {
      await fs.promises.mkdir(expected);
    } catch (error) {
      if (error.code === "EEXIST") throw changed();
      throw error;
    }
  }
  // Each install gets a new, empty folder of its own, so nothing planted beforehand is reused,
  // and it must really be inside the staging folder (not a link swapped in meanwhile).
  const dir = await fs.promises.mkdtemp(path.join(expected, "install-"));
  const realDir = await fs.promises.realpath(dir);
  if (path.dirname(realDir) !== expected || !(await fs.promises.lstat(expected)).isDirectory() || !(await fs.promises.lstat(dir)).isDirectory()) {
    // Remove only the new folder made through the link, then refuse.
    await fs.promises.rmdir(dir).catch(() => {});
    throw changed();
  }
  return realDir;
}
// A staging folder found in place is used only if it is a real folder of this account that
// no one else can write to (on Windows the data folder's own permissions apply).
function ownStagingFolder(stats) {
  if (!stats.isDirectory()) return false;
  if (process.platform === "win32" || typeof process.getuid !== "function") return true;
  return stats.uid === process.getuid() && (stats.mode & 0o022) === 0;
}
// The name as the renderer sent it, cut to a file-name length for the audit log.
export function shortInstallerName(installerPath) {
  return path.basename(typeof installerPath === "string" ? installerPath : "").slice(0, 255);
}
// The staged copy is hashed again just before it runs, so the hash in the audit log is the
// hash of what was launched.
// Read through a handle opened without following links or waiting on a pipe, and only if it
// is a regular file, so a link or pipe put in its place cannot redirect or stall the check.
export async function hashFile(filePath, expected = null) {
  const handle = await fs.promises.open(filePath, INSTALLER_OPEN_FLAGS);
  try {
    const stats = await handle.stat({ bigint: true });
    if (!stats.isFile()) return "";
    // Only the very file that was copied, at its copied size, is read, and never past that size.
    if (expected && (stats.dev !== expected.dev || stats.ino !== expected.ino || stats.size !== expected.size)) return "";
    const size = expected ? expected.size : stats.size;
    const hash = crypto.createHash("sha256");
    let read = 0n;
    if (size > 0n) {
      const reader = handle.createReadStream({ autoClose: false, start: 0, end: Number(size - 1n) });
      for await (const chunk of reader) {
        read += BigInt(chunk.length);
        hash.update(chunk);
      }
    }
    return read === size ? hash.digest("hex") : "";
  } finally {
    await handle.close().catch(() => {});
  }
}
function sameFile(a, b) {
  return a.dev === b.dev && a.ino === b.ino;
}
// The caller must allow only one install at a time: staging clears copies left by earlier
// attempts, which would remove a copy another install is still using.
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
        const markPath = `${checked}:Zone.Identifier`;
        // A real mark is a few hundred bytes; anything far larger is not read into memory.
        if (fs.statSync(markPath).size > 64 * 1024) {
          console.warn("[updates] The installer's download mark is too large to copy; it was skipped.");
        } else {
          fs.writeFileSync(`${stagedPath}:Zone.Identifier`, fs.readFileSync(markPath));
        }
      } catch (error) {
        if (error.code !== "ENOENT") console.warn(`[updates] The installer's download mark could not be copied (${error.code || error.message}).`);
      }
    }
    const copiedStats = fs.lstatSync(stagedPath, { bigint: true });
    return { stagedPath, sha256: hash.digest("hex"), stagedFile: { dev: copiedStats.dev, ino: copiedStats.ino, size: copiedStats.size } };
  } catch (error) {
    if (stagingDir) removeStagingTree(stagingDir, 1);
    if (error.guided) throw error;
    console.error("[updates] Preparing the installer failed:", error);
    // A full disk is always the data-folder side: only the copy writes. Otherwise the file
    // named in the error says which side failed.
    const diskFull = error.code === "ENOSPC" || error.code === "EDQUOT";
    const inStaging = diskFull || (typeof error.path === "string" && isInsideStaging(error.path, dataRoot));
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
