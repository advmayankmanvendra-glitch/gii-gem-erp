import fs from "node:fs";
import path from "node:path";

function historyFilePath(runtimeRoot) {
  const dir = path.join(runtimeRoot, "deployment");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "go-live-history.json");
}

function isValidHistory(history) {
  if (!history || typeof history !== "object" || !Array.isArray(history.entries)) return false;
  if (!Number.isInteger(history.nextId) || history.nextId < 1) return false;
  // Every entry must be a record with its own id, and nextId must be past all of them,
  // or the next run would reuse an id and point at the wrong backup.
  const ids = history.entries.map((entry) => (entry && typeof entry === "object" ? entry.id : null));
  if (!ids.every((id) => Number.isInteger(id) && id >= 1)) return false;
  return new Set(ids).size === ids.length && ids.every((id) => id < history.nextId);
}

// Fail closed: the go-live history is the evidence that ties each run to its
// pre-go-live backup (rollbackService depends on it). An empty history is only
// created when no file exists yet. A file that cannot be read is left alone;
// a file that is damaged is kept under a *.corrupt-<timestamp> name so it can
// be recovered, and the caller gets an error that says what to do.
function readHistory(runtimeRoot) {
  const filePath = historyFilePath(runtimeRoot);
  if (!fs.existsSync(filePath)) {
    // A history set aside earlier as damaged means there WAS evidence. Starting
    // empty would restart IDs at 1 and lose the backup links, so stay blocked.
    const base = path.basename(filePath);
    const kept = fs.readdirSync(path.dirname(filePath)).filter((name) => name.startsWith(`${base}.corrupt-`));
    if (kept.length > 0) {
      throw new Error(
        `The go-live history is missing and a damaged copy was kept as ${path.join(path.dirname(filePath), kept.sort().at(-1))}. `
        + "Restore a good go-live-history.json from a backup (or ask support to repair the kept file) before running go-live or rollback again."
      );
    }
    return { entries: [], nextId: 1 };
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(
      `The go-live history at ${filePath} could not be read (${error.code || error.message}). `
      + "Close any program using the file, check that this user can read it, then try again."
    );
  }

  let history = null;
  try {
    history = JSON.parse(raw);
  } catch { /* handled below as a damaged file */ }

  if (!isValidHistory(history)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const preservedPath = `${filePath}.corrupt-${stamp}`;
    try {
      fs.renameSync(filePath, preservedPath);
    } catch (error) {
      throw new Error(
        `The go-live history at ${filePath} is damaged and could not be set aside (${error.code || error.message}). `
        + "Copy the file somewhere safe, remove it, then try again. Go-live is blocked until then."
      );
    }
    throw new Error(
      `The go-live history at ${filePath} was damaged. It has been kept as ${preservedPath}. `
      + `Restore a good copy of go-live-history.json (the previous version is kept next to it as go-live-history.json.bak) before running go-live or rollback again.`
    );
  }
  return history;
}

// Written to a temporary file and renamed into place, so a crash or full disk mid-write
// leaves the previous history intact instead of a half-written file that blocks go-live
// and rollback. The previous version is kept as go-live-history.json.bak.
function writeHistory(runtimeRoot, history) {
  const filePath = historyFilePath(runtimeRoot);
  const tempPath = `${filePath}.tmp-${process.pid}`;
  const fd = fs.openSync(tempPath, "w");
  try {
    fs.writeSync(fd, JSON.stringify(history, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (fs.existsSync(filePath)) fs.copyFileSync(filePath, `${filePath}.bak`);
  fs.renameSync(tempPath, filePath);
}

export function recordGoLiveEntry(runtimeRoot, entry) {
  const history = readHistory(runtimeRoot);
  const id = history.nextId;
  const now = new Date();
  entry.id = id;
  entry.goliveNumber = `GL-${String(id).padStart(4, "0")}`;
  entry.generatedAt = now.toISOString();
  entry.generatedDate = now.toLocaleDateString();
  entry.generatedTime = now.toLocaleTimeString();
  entry.rollbackHistory = entry.rollbackHistory || [];
  history.entries.unshift(entry);
  history.nextId = id + 1;
  writeHistory(runtimeRoot, history);
  return entry;
}

export function getGoLiveHistory(runtimeRoot) {
  return readHistory(runtimeRoot).entries;
}

export function updateGoLiveEntry(runtimeRoot, id, updates) {
  const history = readHistory(runtimeRoot);
  const entry = history.entries.find(e => e.id === id);
  if (entry) {
    Object.assign(entry, updates);
    writeHistory(runtimeRoot, history);
  }
  return entry || null;
}

export function getLastGoLive(runtimeRoot) {
  const entries = readHistory(runtimeRoot).entries;
  return entries.length > 0 ? entries[0] : null;
}