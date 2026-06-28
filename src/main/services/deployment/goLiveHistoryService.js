import fs from "node:fs";
import path from "node:path";

function historyFilePath(runtimeRoot) {
  const dir = path.join(runtimeRoot, "deployment");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "go-live-history.json");
}

function readHistory(runtimeRoot) {
  const filePath = historyFilePath(runtimeRoot);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch { /* return empty */ }
  return { entries: [], nextId: 1 };
}

function writeHistory(runtimeRoot, history) {
  fs.writeFileSync(historyFilePath(runtimeRoot), JSON.stringify(history, null, 2));
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