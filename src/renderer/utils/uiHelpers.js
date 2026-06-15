export function isAdminUser(session) {
  return ["admin", "administrator", "system administrator"].includes(String(session?.role || session?.displayName || "").toLowerCase());
}

export function requestPrintPreview() {
  window.dispatchEvent(new CustomEvent("gii-gem-print-preview"));
}

export function readJsonPreference(key, fallback) {
  try {
    const value = window.localStorage?.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
